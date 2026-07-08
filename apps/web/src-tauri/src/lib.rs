use std::fs;
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State as AxumState,
    },
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use base64::Engine;
use futures_util::{sink::SinkExt, stream::StreamExt};
use image::GenericImageView;
use local_ip_address::{list_afinet_netifas, local_ip};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    net::{TcpListener, UdpSocket},
    sync::broadcast,
};
use tower_http::cors::CorsLayer;

mod license;
use license::{require_license, LicenseGuard, LicenseManager};

#[derive(Debug, Serialize)]
struct LocalStatePayload {
    snapshot: Option<Value>,
    staff: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NativePrinter {
    name: String,
    label: String,
    #[serde(rename = "portName")]
    port_name: String,
    #[serde(rename = "driverName")]
    driver_name: String,
    status: String,
    #[serde(rename = "isDefault")]
    is_default: bool,
}

#[derive(Debug, Deserialize)]
struct NativeQrCode {
    data: String,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NativePrintPayload {
    printer: String,
    #[serde(rename = "jobName")]
    job_name: String,
    text: String,
    #[serde(default, rename = "autoCut")]
    auto_cut: bool,
    #[serde(default, rename = "openCashDrawer")]
    open_cash_drawer: bool,
    #[serde(default, rename = "qrCodes")]
    qr_codes: Vec<NativeQrCode>,
    #[serde(default, rename = "logoDataUrl")]
    logo_data_url: Option<String>,
}

#[derive(Clone)]
struct LanServerState {
    app: AppHandle,
    license_guard: LicenseGuard,
    broadcaster: broadcast::Sender<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanServerStatusPayload {
    running: bool,
    bind_host: String,
    port: u16,
    ip_address: Option<String>,
    primary_url: Option<String>,
    urls: Vec<String>,
    last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LanLoginPayload {
    email_or_phone: String,
    password: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LanSaveStatePayload {
    tenant_id: String,
    payload: Value,
    client_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LanRealtimeQuery {
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    login: Option<String>,
    #[serde(default)]
    secret: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanHelloPayload {
    app: String,
    name: String,
    version: String,
    status: String,
    http_port: u16,
    discovery_port: u16,
    primary_url: Option<String>,
    ip_address: Option<String>,
    licensed: bool,
    outlet: Option<LanOutlet>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LanStaffAccount {
    id: String,
    tenant_id: String,
    name: String,
    email: Option<String>,
    phone: Option<String>,
    role: String,
    status: String,
    password: String,
    pin: Option<String>,
    access_starts_at: Option<String>,
    access_ends_at: Option<String>,
    restaurant_name: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanPublicUser {
    id: String,
    tenant_id: String,
    name: String,
    email: Option<String>,
    phone: Option<String>,
    role: String,
    status: String,
    pin: Option<String>,
    restaurant_name: Option<String>,
    created_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LanOutlet {
    id: String,
    tenant_id: String,
    name: String,
    code: String,
    timezone: String,
    currency: String,
    status: String,
}

fn to_error<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(to_error)?;
    fs::create_dir_all(&app_dir).map_err(to_error)?;
    Ok(app_dir.join("bhojpatra-desk.sqlite"))
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let connection = Connection::open(path).map_err(to_error)?;
    connection
        .execute_batch(
            "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      ",
        )
        .map_err(to_error)?;
    Ok(connection)
}

fn remove_web_cache_dirs(root: PathBuf, depth: usize) {
    if depth > 4 || !root.exists() {
        return;
    }
    let cache_dir_names = [
        "Cache",
        "Code Cache",
        "DawnCache",
        "GPUCache",
        "GrShaderCache",
        "ShaderCache",
        "Service Worker",
        "blob_storage",
    ];
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if cache_dir_names
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(&name))
        {
            let _ = fs::remove_dir_all(&path);
        } else {
            remove_web_cache_dirs(path, depth + 1);
        }
    }
}

fn clear_desktop_webview_cache(app: &AppHandle) {
    if let Ok(path) = app.path().app_cache_dir() {
        remove_web_cache_dirs(path, 0);
    }
    if let Ok(path) = app.path().app_local_data_dir() {
        remove_web_cache_dirs(path, 0);
    }
}

#[cfg(windows)]
fn ensure_windows_firewall_rules() {
    let rules = [
        (
            "BhojPatra Desk LAN TCP 3000",
            "TCP",
            "3000",
            "BhojPatra Desk LAN realtime API",
        ),
        (
            "BhojPatra Desk LAN Discovery UDP 3001",
            "UDP",
            "3001",
            "BhojPatra Desk mobile discovery",
        ),
    ];

    for (name, protocol, port, description) in rules {
        let delete_script = format!(
            "netsh advfirewall firewall delete rule name=\"{}\" | Out-Null",
            name
        );
        let add_script = format!(
            "netsh advfirewall firewall add rule name=\"{}\" dir=in action=allow protocol={} localport={} profile=private,domain description=\"{}\" | Out-Null",
            name, protocol, port, description
        );
        let _ = powershell_command(&delete_script).output();
        let _ = powershell_command(&add_script).output();
    }
}

#[cfg(not(windows))]
fn ensure_windows_firewall_rules() {}

fn read_json(connection: &Connection, key: &str) -> Result<Option<Value>, String> {
    let stored = connection
        .query_row("SELECT value FROM app_state WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(to_error)?;

    stored
        .map(|payload| serde_json::from_str(&payload).map_err(to_error))
        .transpose()
}

fn write_json(connection: &Connection, key: &str, value: &Value) -> Result<(), String> {
    let payload = serde_json::to_string(value).map_err(to_error)?;
    connection
        .execute(
            "
        INSERT INTO app_state (key, value, updated_at)
        VALUES (?1, ?2, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      ",
            params![key, payload],
        )
        .map_err(to_error)?;
    Ok(())
}

fn normalize_login(value: &str) -> String {
    value.trim().to_lowercase()
}

fn parse_staff_accounts(value: Option<Value>) -> Vec<LanStaffAccount> {
    value
        .and_then(|payload| serde_json::from_value::<Vec<LanStaffAccount>>(payload).ok())
        .unwrap_or_default()
}

fn read_snapshot(connection: &Connection) -> Result<Option<Value>, String> {
    read_json(connection, "snapshot")
}

fn read_staff_accounts(connection: &Connection) -> Result<Vec<LanStaffAccount>, String> {
    Ok(parse_staff_accounts(read_json(connection, "staff")?))
}

fn snapshot_outlet(snapshot: &Value) -> LanOutlet {
    let outlet = snapshot.get("outlet").and_then(Value::as_object);
    let id = outlet
        .and_then(|value| value.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("out_local")
        .to_string();
    let tenant_id = outlet
        .and_then(|value| value.get("tenantId"))
        .and_then(Value::as_str)
        .unwrap_or("local_restaurant")
        .to_string();
    let name = outlet
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("BhojPatra Bistro")
        .to_string();
    let code = outlet
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
        .unwrap_or("BHOJ")
        .to_string();
    let timezone = outlet
        .and_then(|value| value.get("timezone"))
        .and_then(Value::as_str)
        .unwrap_or("Asia/Kolkata")
        .to_string();
    let currency = outlet
        .and_then(|value| value.get("currency"))
        .and_then(Value::as_str)
        .unwrap_or("INR")
        .to_string();
    let status = outlet
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("active")
        .to_string();

    LanOutlet {
        id,
        tenant_id,
        name,
        code,
        timezone,
        currency,
        status,
    }
}

fn to_public_user(account: &LanStaffAccount) -> LanPublicUser {
    LanPublicUser {
        id: account.id.clone(),
        tenant_id: account.tenant_id.clone(),
        name: account.name.clone(),
        email: account.email.clone(),
        phone: account.phone.clone(),
        role: account.role.clone(),
        status: account.status.clone(),
        pin: account.pin.clone(),
        restaurant_name: account.restaurant_name.clone(),
        created_at: account.created_at.clone(),
    }
}

fn active_outlet_identifiers(state: &LanServerState) -> Vec<String> {
    let snapshot = open_database(&state.app)
        .ok()
        .and_then(|connection| read_snapshot(&connection).ok().flatten());
    let mut identifiers = Vec::new();
    if let Some(snapshot) = snapshot {
        let outlet = snapshot_outlet(&snapshot);
        identifiers.push(outlet.id);
        identifiers.push(outlet.tenant_id);
    }
    identifiers
}

fn can_access_outlet(account: &LanStaffAccount, outlet_id: &str, state: &LanServerState) -> bool {
    outlet_id == format!("out_{}", account.tenant_id)
        || outlet_id == "out_local"
        || outlet_id == account.tenant_id
        || active_outlet_identifiers(state)
            .into_iter()
            .any(|candidate| candidate == outlet_id)
}

fn verify_account_access_window(account: &LanStaffAccount) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    if let Some(value) = &account.access_starts_at {
        if chrono::DateTime::parse_from_rfc3339(value)
            .map(|date| date.timestamp_millis() > now)
            .unwrap_or(false)
        {
            return Err("This login is not active yet".to_string());
        }
    }
    if let Some(value) = &account.access_ends_at {
        if chrono::DateTime::parse_from_rfc3339(value)
            .map(|date| date.timestamp_millis() < now)
            .unwrap_or(false)
        {
            return Err("This login has expired".to_string());
        }
    }
    Ok(())
}

fn authenticate_basic(
    headers: &HeaderMap,
    state: &LanServerState,
) -> Result<LanStaffAccount, (StatusCode, Json<Value>)> {
    if !state.license_guard.is_valid() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Valid license required to use BhojPatra Desk" })),
        ));
    }
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let encoded = auth_header.strip_prefix("Basic ").unwrap_or("");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid credentials" })),
            )
        })?;
    let decoded = String::from_utf8(decoded).map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid credentials" })),
        )
    })?;
    let mut parts = decoded.splitn(2, ':');
    let login = parts.next().unwrap_or("");
    let secret = parts.next().unwrap_or("");
    authenticate_credentials(login, secret, state)
}

fn authenticate_credentials(
    login: &str,
    secret: &str,
    state: &LanServerState,
) -> Result<LanStaffAccount, (StatusCode, Json<Value>)> {
    if !state.license_guard.is_valid() {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Valid license required to use BhojPatra Desk" })),
        ));
    }
    let connection = open_database(&state.app).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let staff = read_staff_accounts(&connection).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let normalized_login = normalize_login(login);
    let Some(account) = staff.into_iter().find(|candidate| {
        normalize_login(candidate.email.as_deref().unwrap_or("")) == normalized_login
            || normalize_login(candidate.phone.as_deref().unwrap_or("")) == normalized_login
    }) else {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid credentials" })),
        ));
    };

    if account.status != "active" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "This login is not active" })),
        ));
    }
    verify_account_access_window(&account)
        .map_err(|error| (StatusCode::FORBIDDEN, Json(json!({ "error": error }))))?;
    let valid_passwords = [Some(account.password.as_str()), account.pin.as_deref()];
    if !valid_passwords
        .into_iter()
        .flatten()
        .any(|value| value == secret)
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid credentials" })),
        ));
    }
    Ok(account)
}

fn snapshot_score(snapshot: Option<&Value>) -> usize {
    let Some(payload) = snapshot.and_then(Value::as_object) else {
        return 0;
    };
    let count = |key: &str, weight: usize| -> usize {
        payload
            .get(key)
            .and_then(Value::as_array)
            .map(|items| items.len() * weight)
            .unwrap_or(0)
    };
    let saved_carts = payload
        .get("savedCarts")
        .and_then(Value::as_object)
        .map(|carts| {
            carts
                .values()
                .map(|cart| cart.as_array().map(|items| items.len() * 7).unwrap_or(0))
                .sum::<usize>()
        })
        .unwrap_or(0);
    [
        count("menuItems", 10),
        count("orders", 8),
        count("orderItems", 6),
        count("payments", 6),
        count("kots", 5),
        count("tables", 3),
        count("floors", 2),
        count("menuCategories", 2),
        count("inventoryItems", 2),
        saved_carts,
    ]
    .into_iter()
    .sum()
}

fn is_private_ipv4(address: Ipv4Addr) -> bool {
    let octets = address.octets();
    octets[0] == 10
        || (octets[0] == 172 && (16..=31).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 168)
}

fn is_lan_candidate(address: Ipv4Addr) -> bool {
    !address.is_loopback()
        && address != Ipv4Addr::UNSPECIFIED
        && !address.is_link_local()
        && is_private_ipv4(address)
}

fn interface_score(name: &str, address: Ipv4Addr) -> i32 {
    let lower = name.to_ascii_lowercase();
    let mut score = 100;
    if lower.contains("wi-fi") || lower.contains("wifi") || lower.contains("wlan") {
        score -= 50;
    }
    if lower.contains("ethernet") || lower.contains("local area") {
        score -= 35;
    }
    if address.octets()[0] == 192 {
        score -= 10;
    }
    if lower.contains("tailscale")
        || lower.contains("zerotier")
        || lower.contains("wireguard")
        || lower.contains("vpn")
        || lower.contains("wsl")
        || lower.contains("docker")
        || lower.contains("vmware")
        || lower.contains("virtualbox")
        || lower.contains("hyper-v")
        || lower.contains("bluetooth")
    {
        score += 150;
    }
    score
}

fn current_lan_ips() -> Vec<String> {
    let mut candidates = list_afinet_netifas()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(name, address)| match address {
            IpAddr::V4(ipv4) if is_lan_candidate(ipv4) => {
                Some((interface_score(&name, ipv4), ipv4.to_string()))
            }
            _ => None,
        })
        .collect::<Vec<_>>();

    if let Ok(IpAddr::V4(ipv4)) = local_ip() {
        if is_lan_candidate(ipv4) && !candidates.iter().any(|(_, ip)| ip == &ipv4.to_string()) {
            candidates.push((interface_score("local_ip", ipv4), ipv4.to_string()));
        }
    }

    candidates.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
    candidates.dedup_by(|a, b| a.1 == b.1);
    candidates.into_iter().map(|(_, ip)| ip).collect()
}

fn lan_status_snapshot(
    port: u16,
    running: bool,
    last_error: Option<String>,
) -> LanServerStatusPayload {
    let ips = current_lan_ips();
    let ip_address = ips.first().cloned();
    let mut urls = ips
        .iter()
        .map(|ip| format!("http://{}:{}", ip, port))
        .collect::<Vec<_>>();
    urls.push(format!("http://127.0.0.1:{}", port));
    LanServerStatusPayload {
        running,
        bind_host: "0.0.0.0".to_string(),
        port,
        primary_url: urls.first().cloned(),
        ip_address,
        urls,
        last_error,
    }
}

fn update_lan_status(status: &Arc<Mutex<LanServerStatusPayload>>, next: LanServerStatusPayload) {
    if let Ok(mut guard) = status.lock() {
        *guard = next;
    }
}

fn ascii_bytes(value: &str) -> Vec<u8> {
    value
        .replace("â‚¹", "Rs.")
        .replace('₹', "Rs.")
        .replace(['–', '—'], "-")
        .chars()
        .map(|ch| if ch.is_ascii() { ch as u8 } else { b' ' })
        .collect()
}

fn append_qr_bytes(bytes: &mut Vec<u8>, qr: &NativeQrCode) {
    let data = qr.data.trim();
    if data.is_empty() {
        return;
    }
    let qr_data = ascii_bytes(data);
    if qr_data.is_empty() {
        return;
    }
    let label = qr.label.as_deref().unwrap_or("").trim();
    bytes.extend_from_slice(&[0x0a, 0x1b, 0x61, 0x01]);
    if !label.is_empty() {
        bytes.extend_from_slice(&ascii_bytes(label));
        bytes.push(0x0a);
    }
    let store_len = qr_data.len() + 3;
    bytes.extend_from_slice(&[0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
    bytes.extend_from_slice(&[0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]);
    bytes.extend_from_slice(&[0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);
    bytes.extend_from_slice(&[
        0x1d,
        0x28,
        0x6b,
        (store_len % 256) as u8,
        (store_len / 256) as u8,
        0x31,
        0x50,
        0x30,
    ]);
    bytes.extend_from_slice(&qr_data);
    bytes.extend_from_slice(&[
        0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, 0x0a, 0x1b, 0x61, 0x00,
    ]);
}

fn logo_to_esc_pos_raster(data_url: &str) -> Vec<u8> {
    // Strip the data:image/...;base64, prefix
    let base64_data = match data_url.find(",") {
        Some(idx) => &data_url[idx + 1..],
        None => return vec![],
    };
    // Decode base64
    let raw_bytes = match base64::engine::general_purpose::STANDARD.decode(base64_data) {
        Ok(b) => b,
        Err(_) => return vec![],
    };
    // Load image
    let img = match image::load_from_memory(&raw_bytes) {
        Ok(img) => img,
        Err(_) => return vec![],
    };
    // Keep restaurant logos small on thermal paper. The old 384px limit filled
    // most of an 80mm receipt and made uploaded logos print like a banner.
    const MAX_WIDTH: u32 = 72;
    const MAX_HEIGHT: u32 = 48;
    let (orig_w, orig_h) = img.dimensions();
    let scale = (MAX_WIDTH as f64 / orig_w.max(1) as f64)
        .min(MAX_HEIGHT as f64 / orig_h.max(1) as f64)
        .min(1.0);
    let (new_w, new_h) = if scale < 1.0 {
        (
            ((orig_w as f64 * scale).round() as u32).max(1),
            ((orig_h as f64 * scale).round() as u32).max(1),
        )
    } else {
        (orig_w, orig_h)
    };
    let img = if new_w != orig_w || new_h != orig_h {
        img.resize(new_w, new_h, image::imageops::FilterType::Nearest)
    } else {
        img
    };
    // Convert to grayscale
    let gray = img.to_luma8();
    let width = new_w;
    let height = new_h;
    let bytes_per_row = ((width + 7) / 8) as usize;
    // Build 1-bit monochrome bitmap rows
    let mut bitmap: Vec<u8> = Vec::with_capacity(bytes_per_row * height as usize);
    for y in 0..height {
        let mut row_bytes = vec![0u8; bytes_per_row];
        for x in 0..width {
            let luma = gray.get_pixel(x, y).0[0];
            if luma < 128 {
                // Black pixel -> set bit (MSB first, 1=black)
                row_bytes[(x / 8) as usize] |= 0x80 >> (x % 8);
            }
        }
        bitmap.extend_from_slice(&row_bytes);
    }
    // Build ESC/POS GS v 0 raster command
    let x_l = (bytes_per_row % 256) as u8;
    let x_h = (bytes_per_row / 256) as u8;
    let y_l = (height % 256) as u8;
    let y_h = (height / 256) as u8;
    let mut out: Vec<u8> = Vec::new();
    // Left align so the logo remains a small mark, not a centered masthead.
    out.extend_from_slice(&[0x1b, 0x61, 0x00]);
    // GS v 0 header
    out.extend_from_slice(&[0x1d, 0x76, 0x30, 0x00, x_l, x_h, y_l, y_h]);
    // Bitmap data
    out.extend_from_slice(&bitmap);
    // Newline + left align
    out.extend_from_slice(&[0x0a, 0x1b, 0x61, 0x00]);
    out
}

fn esc_pos_bytes(payload: &NativePrintPayload) -> Vec<u8> {
    let mut bytes = vec![0x1b, 0x40];
    if payload.open_cash_drawer {
        bytes.extend_from_slice(&[0x1b, 0x70, 0x00, 0x19, 0xfa]);
    }
    // Insert logo if provided
    if let Some(ref data_url) = payload.logo_data_url {
        if !data_url.is_empty() {
            let logo_bytes = logo_to_esc_pos_raster(data_url);
            if !logo_bytes.is_empty() {
                bytes.extend_from_slice(&logo_bytes);
            }
        }
    }
    bytes.extend_from_slice(&ascii_bytes(&payload.text));
    if !payload.text.ends_with('\n') {
        bytes.push(0x0a);
    }
    for qr in &payload.qr_codes {
        append_qr_bytes(&mut bytes, qr);
    }
    if payload.auto_cut {
        bytes.extend_from_slice(&[0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);
    } else {
        bytes.extend_from_slice(&[0x0a, 0x0a, 0x0a]);
    }
    bytes
}

fn network_target(raw: &str) -> Option<(String, u16)> {
    let value = raw.trim();
    if value.is_empty() {
        return None;
    }
    for prefix in ["tcp://", "socket://", "raw://", "http://", "https://"] {
        if let Some(rest) = value.strip_prefix(prefix) {
            let host_port = rest.split('/').next().unwrap_or(rest);
            let mut parts = host_port.rsplitn(2, ':');
            let port = parts
                .next()
                .and_then(|candidate| candidate.parse::<u16>().ok())
                .unwrap_or(9100);
            let host = parts
                .next()
                .unwrap_or(host_port)
                .trim_matches(['[', ']'])
                .to_string();
            if !host.is_empty() {
                return Some((host, port));
            }
        }
    }
    let mut parts = value.rsplitn(2, ':');
    if let Some(port) = parts
        .next()
        .and_then(|candidate| candidate.parse::<u16>().ok())
    {
        let host = parts
            .next()
            .unwrap_or("")
            .trim_matches(['[', ']'])
            .to_string();
        if !host.is_empty() {
            return Some((host, port));
        }
    }
    None
}

fn print_tcp(target: (String, u16), bytes: &[u8]) -> Result<(), String> {
    let address = format!("{}:{}", target.0, target.1);
    let socket_address = address
        .parse()
        .map_err(|_| format!("Invalid LAN printer address: {address}"))?;
    let mut stream =
        TcpStream::connect_timeout(&socket_address, Duration::from_secs(10)).map_err(to_error)?;
    stream.write_all(bytes).map_err(to_error)
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn powershell_command(script: &str) -> Command {
    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(windows)]
fn print_windows_queue(
    app: &AppHandle,
    printer: &str,
    job_name: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let directory = app.path().app_cache_dir().map_err(to_error)?;
    fs::create_dir_all(&directory).map_err(to_error)?;
    let file = directory.join("bhojpatra-print-job.bin");
    fs::write(&file, bytes).map_err(to_error)?;
    let script = r#"
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string printerName, out IntPtr hPrinter, IntPtr defaults);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO docInfo);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] bytes, int count, out int written);
  public static void Send(string printerName, byte[] bytes, string jobName) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      DOCINFO docInfo = new DOCINFO();
      docInfo.pDocName = jobName;
      docInfo.pDataType = "RAW";
      if (StartDocPrinter(hPrinter, 1, docInfo) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(hPrinter)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
          int written;
          if (!WritePrinter(hPrinter, bytes, bytes.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());
          if (written != bytes.Length) throw new Exception("Only " + written + " of " + bytes.Length + " bytes were written.");
        } finally { EndPagePrinter(hPrinter); }
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($env:BP_PRINT_FILE)
[RawPrinterHelper]::Send($env:BP_PRINTER_NAME, $bytes, $env:BP_JOB_NAME)
"#;
    let output = powershell_command(script)
        .env("BP_PRINT_FILE", file)
        .env("BP_PRINTER_NAME", printer)
        .env("BP_JOB_NAME", job_name)
        .output()
        .map_err(to_error)?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "Windows printer write failed.".to_string()
        } else {
            stderr
        })
    }
}

#[cfg(windows)]
fn query_windows_printers() -> Result<Vec<NativePrinter>, String> {
    let script = r#"
$printers = @()
try { $printers = @(Get-CimInstance Win32_Printer -ErrorAction Stop) } catch { $printers = @(Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue) }
$printers |
  Where-Object { $_.Name } |
  Select-Object Name, DriverName, PortName, WorkOffline, Default |
  ConvertTo-Json -Compress -Depth 3
"#;
    let output = powershell_command(script).output().map_err(to_error)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(vec![]);
    }
    let parsed: Value = serde_json::from_str(&stdout).map_err(to_error)?;
    let rows = match parsed {
        Value::Array(rows) => rows,
        row => vec![row],
    };
    let mut printers = rows
        .into_iter()
        .filter_map(|row| {
            let name = row.get("Name")?.as_str()?.to_string();
            let port_name = row
                .get("PortName")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let driver_name = row
                .get("DriverName")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let is_default = row.get("Default").and_then(Value::as_bool).unwrap_or(false);
            let offline = row
                .get("WorkOffline")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let label = [name.as_str(), port_name.as_str(), driver_name.as_str()]
                .into_iter()
                .filter(|part| !part.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" - ");
            Some(NativePrinter {
                name,
                label,
                port_name,
                driver_name,
                status: if offline { "offline" } else { "online" }.to_string(),
                is_default,
            })
        })
        .collect::<Vec<_>>();
    printers.sort_by(|a, b| {
        let score = |p: &NativePrinter| {
            let value = format!("{} {} {}", p.name, p.port_name, p.driver_name).to_lowercase();
            if [
                "pos",
                "80",
                "thermal",
                "receipt",
                "rongta",
                "kpc",
                "epson",
                "foodkart",
                "cp001",
                "bluetooth",
            ]
            .iter()
            .any(|needle| value.contains(needle))
            {
                0
            } else {
                1
            }
        };
        score(a).cmp(&score(b)).then_with(|| a.name.cmp(&b.name))
    });
    Ok(printers)
}

#[tauri::command]
fn load_local_state(
    app: AppHandle,
    guard: State<'_, LicenseGuard>,
) -> Result<LocalStatePayload, String> {
    require_license(&guard)?;
    let connection = open_database(&app)?;
    Ok(LocalStatePayload {
        snapshot: read_json(&connection, "snapshot")?,
        staff: read_json(&connection, "staff")?,
    })
}

#[tauri::command]
fn save_local_state(
    app: AppHandle,
    guard: State<'_, LicenseGuard>,
    broadcaster: State<'_, broadcast::Sender<String>>,
    snapshot: Value,
    staff: Value,
) -> Result<(), String> {
    require_license(&guard)?;
    let connection = open_database(&app)?;
    write_json(&connection, "snapshot", &snapshot)?;
    write_json(&connection, "staff", &staff)?;
    let outlet_id = snapshot_outlet(&snapshot).id;
    let event = json!({
      "type": "STATE_UPDATED",
      "outletId": outlet_id,
      "payload": snapshot,
      "timestamp": chrono::Utc::now().to_rfc3339(),
      "clientId": "desktop-save",
    });
    let _ = broadcaster.send(event.to_string());
    Ok(())
}

#[tauri::command]
async fn activate_license(
    manager: State<'_, LicenseManager>,
    guard: State<'_, LicenseGuard>,
    key: String,
) -> Result<Value, String> {
    match manager.activate(key).await {
        Ok(message) => {
            guard.set_valid(true);
            Ok(serde_json::json!({ "success": true, "message": message }))
        }
        Err(message) => Ok(serde_json::json!({ "success": false, "message": message })),
    }
}

#[tauri::command]
async fn check_license(
    manager: State<'_, LicenseManager>,
    guard: State<'_, LicenseGuard>,
) -> Result<bool, String> {
    let valid = manager.check_license().await;
    guard.set_valid(valid);
    Ok(valid)
}

#[tauri::command]
fn get_license_status(manager: State<'_, LicenseManager>) -> Result<license::LicenseData, String> {
    Ok(manager.get_status())
}

#[tauri::command]
fn list_native_printers(guard: State<'_, LicenseGuard>) -> Result<Vec<NativePrinter>, String> {
    require_license(&guard)?;
    #[cfg(windows)]
    {
        query_windows_printers()
    }
    #[cfg(not(windows))]
    {
        Err("Built-in direct printing is currently available on Windows desktop.".to_string())
    }
}

#[tauri::command]
fn print_native(
    app: AppHandle,
    guard: State<'_, LicenseGuard>,
    payload: NativePrintPayload,
) -> Result<(), String> {
    require_license(&guard)?;
    let printer = payload.printer.trim();
    if printer.is_empty() {
        return Err("Select a printer before printing.".to_string());
    }
    let bytes = esc_pos_bytes(&payload);
    if let Some(target) = network_target(printer) {
        return print_tcp(target, &bytes);
    }
    #[cfg(windows)]
    {
        print_windows_queue(&app, printer, &payload.job_name, &bytes)
    }
    #[cfg(not(windows))]
    {
        Err("Built-in direct printing is currently available on Windows desktop.".to_string())
    }
}

#[tauri::command]
fn get_lan_server_status(
    state: State<'_, Arc<Mutex<LanServerStatusPayload>>>,
) -> Result<LanServerStatusPayload, String> {
    state
        .lock()
        .map(|value| value.clone())
        .map_err(|_| "Could not read LAN server status".to_string())
}

async fn lan_health() -> Json<Value> {
    Json(json!({ "status": "ok", "ts": chrono::Utc::now().to_rfc3339() }))
}

fn lan_hello_payload(
    state: &LanServerState,
    port: u16,
    reachable_ip: Option<String>,
) -> LanHelloPayload {
    let connection = open_database(&state.app).ok();
    let outlet = connection
        .as_ref()
        .and_then(|connection| read_snapshot(connection).ok().flatten())
        .map(|snapshot| snapshot_outlet(&snapshot));
    let status = lan_status_snapshot(port, true, None);
    let primary_url = reachable_ip
        .as_ref()
        .map(|ip| format!("http://{}:{}", ip, port))
        .or(status.primary_url);
    LanHelloPayload {
        app: "bhojpatra-desk".to_string(),
        name: "BhojPatra Desk".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        status: "ok".to_string(),
        http_port: port,
        discovery_port: 3001,
        primary_url,
        ip_address: reachable_ip.or(status.ip_address),
        licensed: state.license_guard.is_valid(),
        outlet,
    }
}

async fn lan_hello(AxumState(state): AxumState<LanServerState>) -> Json<LanHelloPayload> {
    Json(lan_hello_payload(&state, 3000, None))
}

async fn lan_login(
    AxumState(state): AxumState<LanServerState>,
    Json(body): Json<LanLoginPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account = authenticate_credentials(&body.email_or_phone, &body.password, &state)?;
    let connection = open_database(&state.app).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let snapshot = read_snapshot(&connection)
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": error })),
            )
        })?
        .unwrap_or_else(|| json!({}));
    let outlet = snapshot_outlet(&snapshot);
    Ok(Json(json!({
      "user": to_public_user(&account),
      "outlets": [outlet],
    })))
}

async fn lan_get_state(
    AxumState(state): AxumState<LanServerState>,
    Path(outlet_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, (StatusCode, Json<Value>)> {
    let account = authenticate_basic(&headers, &state)?;
    if !can_access_outlet(&account, &outlet_id, &state) {
        return Err((StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden" }))));
    }
    let connection = open_database(&state.app).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let snapshot = read_snapshot(&connection).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store, no-cache, must-revalidate"),
    );
    let body = if let Some(payload) = snapshot {
        let outlet = snapshot_outlet(&payload);
        json!({
          "exists": true,
          "outletId": outlet.id,
          "tenantId": outlet.tenant_id,
          "updatedAt": chrono::Utc::now().to_rfc3339(),
          "payload": payload,
        })
    } else {
        json!({
          "exists": false,
          "outletId": outlet_id,
        })
    };
    Ok((response_headers, Json(body)))
}

async fn lan_put_state(
    AxumState(state): AxumState<LanServerState>,
    Path(outlet_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<LanSaveStatePayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let account = authenticate_basic(&headers, &state)?;
    let active_identifiers = active_outlet_identifiers(&state);
    if !can_access_outlet(&account, &outlet_id, &state)
        || (account.tenant_id != body.tenant_id
            && account.tenant_id != "platform"
            && !active_identifiers
                .iter()
                .any(|candidate| candidate == &body.tenant_id))
    {
        return Err((StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden" }))));
    }

    let connection = open_database(&state.app).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let existing = read_snapshot(&connection).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let incoming_score = snapshot_score(Some(&body.payload));
    let existing_score = snapshot_score(existing.as_ref());
    if incoming_score == 0 && existing_score > 0 {
        return Ok(Json(json!({
          "ok": true,
          "outletId": outlet_id,
          "updatedAt": chrono::Utc::now().to_rfc3339(),
          "skipped": true,
          "reason": "Ignored empty snapshot over existing restaurant data",
          "payload": existing,
        })));
    }

    write_json(&connection, "snapshot", &body.payload).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let updated_at = chrono::Utc::now().to_rfc3339();
    let event = json!({
      "type": "STATE_UPDATED",
      "outletId": outlet_id,
      "payload": body.payload,
      "timestamp": updated_at,
      "clientId": body.client_id,
    });
    let _ = state.broadcaster.send(event.to_string());
    let _ = state.app.emit("lan_state_updated", &event["payload"]);

    Ok(Json(json!({
      "ok": true,
      "outletId": outlet_id,
      "updatedAt": updated_at,
    })))
}

async fn lan_realtime(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<LanServerState>,
    Path(outlet_id): Path<String>,
    Query(query): Query<LanRealtimeQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<Value>)> {
    let account = authenticate_credentials(
        query.login.as_deref().unwrap_or(""),
        query.secret.as_deref().unwrap_or(""),
        &state,
    )?;
    if !can_access_outlet(&account, &outlet_id, &state) {
        return Err((StatusCode::FORBIDDEN, Json(json!({ "error": "Forbidden" }))));
    }
    Ok(ws.on_upgrade(move |socket| handle_lan_socket(socket, state, outlet_id, query.client_id)))
}

async fn handle_lan_socket(
    socket: WebSocket,
    state: LanServerState,
    outlet_id: String,
    client_id: Option<String>,
) {
    let (mut sender, mut receiver) = socket.split();
    let mut subscription = state.broadcaster.subscribe();
    let connected = json!({
      "type": "CONNECTED",
      "outletId": outlet_id,
      "payload": { "clientId": client_id },
      "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    let _ = sender
        .send(Message::Text(connected.to_string().into()))
        .await;

    loop {
        tokio::select! {
          message = receiver.next() => {
            let Some(Ok(message)) = message else { break; };
            match message {
              Message::Text(text) => {
                let event = match serde_json::from_str::<Value>(&text) {
                  Ok(value) => value,
                  Err(_) => continue,
                };
                if event.get("type").and_then(Value::as_str) == Some("STATE_UPDATED") {
                  if let Some(payload) = event.get("payload") {
                    if let Ok(connection) = open_database(&state.app) {
                      let _ = write_json(&connection, "snapshot", payload);
                    }
                    let _ = state.app.emit("lan_state_updated", payload);
                  }
                }
                let _ = state.broadcaster.send(event.to_string());
              }
              Message::Ping(payload) => {
                let _ = sender.send(Message::Pong(payload)).await;
              }
              Message::Close(_) => break,
              _ => {}
            }
          }
          broadcast_message = subscription.recv() => {
            let Ok(message) = broadcast_message else { break; };
            if sender.send(Message::Text(message.into())).await.is_err() {
              break;
            }
          }
        }
    }
}

fn spawn_lan_discovery_responder(app: AppHandle, license_guard: LicenseGuard) {
    tauri::async_runtime::spawn(async move {
        let socket = match UdpSocket::bind(SocketAddr::from(([0, 0, 0, 0], 3001))).await {
            Ok(socket) => socket,
            Err(error) => {
                eprintln!("BhojPatra LAN discovery responder failed: {error}");
                return;
            }
        };
        let state = LanServerState {
            app,
            license_guard,
            broadcaster: broadcast::channel::<String>(1).0,
        };
        let mut buffer = [0u8; 512];
        loop {
            let Ok((size, peer)) = socket.recv_from(&mut buffer).await else {
                continue;
            };
            let message = String::from_utf8_lossy(&buffer[..size]);
            if !message.contains("BHOJPATRA_DISCOVER") {
                continue;
            }
            let reachable_ip = socket
                .local_addr()
                .ok()
                .and_then(|address| match address.ip() {
                    IpAddr::V4(ipv4) if !ipv4.is_unspecified() => Some(ipv4.to_string()),
                    _ => None,
                });
            let payload = lan_hello_payload(&state, 3000, reachable_ip);
            let Ok(serialized) = serde_json::to_vec(&payload) else {
                continue;
            };
            let _ = socket.send_to(&serialized, peer).await;
        }
    });
}

fn spawn_lan_server(
    app: AppHandle,
    license_guard: LicenseGuard,
    status: Arc<Mutex<LanServerStatusPayload>>,
    broadcaster: broadcast::Sender<String>,
) {
    let port = status.lock().map(|value| value.port).unwrap_or(3000);
    let shared_state = LanServerState {
        app: app.clone(),
        license_guard,
        broadcaster,
    };
    tauri::async_runtime::spawn(async move {
        let cors = CorsLayer::new()
            .allow_origin(HeaderValue::from_static("*"))
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::OPTIONS])
            .allow_headers([header::CONTENT_TYPE, header::ACCEPT, header::AUTHORIZATION]);
        let router = Router::new()
            .route("/health", get(lan_health))
            .route("/api/v1/lan/hello", get(lan_hello))
            .route("/api/v1/auth/login", post(lan_login))
            .route(
                "/api/v1/outlets/:outlet_id/state",
                get(lan_get_state).put(lan_put_state),
            )
            .route("/api/v1/outlets/:outlet_id/realtime", get(lan_realtime))
            .with_state(shared_state.clone())
            .layer(cors);
        let address = SocketAddr::from(([0, 0, 0, 0], port));
        match TcpListener::bind(address).await {
            Ok(listener) => {
                update_lan_status(&status, lan_status_snapshot(port, true, None));
                if let Err(error) = axum::serve(listener, router).await {
                    update_lan_status(
                        &status,
                        lan_status_snapshot(port, false, Some(error.to_string())),
                    );
                }
            }
            Err(error) => {
                update_lan_status(
                    &status,
                    lan_status_snapshot(port, false, Some(error.to_string())),
                );
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            clear_desktop_webview_cache(app.handle());
            ensure_windows_firewall_rules();
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            app.manage(LicenseManager::new(app.handle()));
            let license_guard = LicenseGuard::new();
            let lan_status = Arc::new(Mutex::new(lan_status_snapshot(3000, false, None)));
            let (lan_broadcaster, _) = broadcast::channel::<String>(128);
            spawn_lan_server(
                app.handle().clone(),
                license_guard.clone(),
                lan_status.clone(),
                lan_broadcaster.clone(),
            );
            spawn_lan_discovery_responder(app.handle().clone(), license_guard.clone());
            app.manage(license_guard);
            app.manage(lan_status);
            app.manage(lan_broadcaster);
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_local_state,
            save_local_state,
            activate_license,
            check_license,
            get_license_status,
            get_lan_server_status,
            list_native_printers,
            print_native
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
