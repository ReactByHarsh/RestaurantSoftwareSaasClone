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
use std::{
    ffi::OsStr,
    os::windows::{ffi::OsStrExt, process::CommandExt},
    ptr,
};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::HANDLE,
    Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, GetDefaultPrinterW,
        OpenPrinterW, StartDocPrinterW, StartPagePrinter, WritePrinter, DOC_INFO_1W,
        PRINTER_ATTRIBUTE_DEFAULT, PRINTER_ATTRIBUTE_WORK_OFFLINE, PRINTER_ENUM_CONNECTIONS,
        PRINTER_ENUM_LOCAL, PRINTER_INFO_5W,
    },
    Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives},
    System::WindowsProgramming::DRIVE_FIXED,
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    net::{TcpListener, UdpSocket},
    sync::broadcast,
};
use tower_http::cors::CorsLayer;

#[derive(Debug, Serialize)]
struct LocalStatePayload {
    snapshot: Option<Value>,
    staff: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalBackupResult {
    date: String,
    file_name: String,
    created: bool,
    size_bytes: u64,
    paths: Vec<String>,
    errors: Vec<String>,
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
    broadcaster: broadcast::Sender<String>,
}

#[derive(Clone, Default)]
struct DesktopStateWriteLock(Arc<Mutex<()>>);

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
    expected_updated_at: Option<String>,
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
        CREATE TABLE IF NOT EXISTS app_state_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_app_state_history_key_id
          ON app_state_history(key, id DESC);
        CREATE TABLE IF NOT EXISTS sync_records (
          key TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          order_uuid TEXT,
          version INTEGER NOT NULL,
          base_version INTEGER NOT NULL,
          payload_hash TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced_at TEXT,
          conflict_state TEXT,
          row_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_outbox (
          key TEXT PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          order_uuid TEXT,
          version INTEGER NOT NULL,
          base_version INTEGER NOT NULL,
          payload_hash TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          batch_id TEXT NOT NULL,
          retry_count INTEGER NOT NULL DEFAULT 0,
          row_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
          ON sync_outbox(updated_at, retry_count);
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          key TEXT PRIMARY KEY,
          entity_id TEXT NOT NULL,
          order_uuid TEXT,
          code TEXT NOT NULL,
          created_at TEXT NOT NULL,
          row_json TEXT NOT NULL
        );
      ",
        )
        .map_err(to_error)?;
    Ok(connection)
}

fn local_backup_file_name(date: &str) -> String {
    format!("BhojPatra-Backup-{date}.sqlite")
}

#[cfg(windows)]
fn fixed_drive_roots() -> Vec<PathBuf> {
    let mask = unsafe { GetLogicalDrives() };
    (0..26)
        .filter_map(|index| {
            if mask & (1 << index) == 0 {
                return None;
            }
            let letter = (b'A' + index as u8) as char;
            let root = format!("{letter}:\\");
            let wide = OsStr::new(&root)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            (unsafe { GetDriveTypeW(wide.as_ptr()) } == DRIVE_FIXED).then(|| PathBuf::from(root))
        })
        .collect()
}

#[cfg(not(windows))]
fn fixed_drive_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn copy_backup_file(
    source: &PathBuf,
    directory: &PathBuf,
    file_name: &str,
    force: bool,
) -> Result<PathBuf, String> {
    fs::create_dir_all(directory).map_err(to_error)?;
    let destination = directory.join(file_name);
    if destination.exists() && !force {
        return Ok(destination);
    }
    let temporary = directory.join(format!(".{file_name}.tmp"));
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    if let Err(error) = fs::copy(source, &temporary) {
        let _ = fs::remove_file(&temporary);
        return Err(to_error(error));
    }
    if destination.exists() {
        fs::remove_file(&destination).map_err(to_error)?;
    }
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        return Err(to_error(error));
    }
    Ok(destination)
}

fn create_local_backup(app: &AppHandle, force: bool) -> Result<LocalBackupResult, String> {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let file_name = local_backup_file_name(&date);
    let protected_directory = app.path().app_data_dir().map_err(to_error)?.join("backups");
    fs::create_dir_all(&protected_directory).map_err(to_error)?;
    let protected_file = protected_directory.join(&file_name);
    let created = force || !protected_file.exists();

    if created {
        let temporary = protected_directory.join(format!(".{file_name}.tmp"));
        if temporary.exists() {
            let _ = fs::remove_file(&temporary);
        }
        let connection = open_database(app)?;
        connection
            .execute_batch("PRAGMA wal_checkpoint(FULL);")
            .map_err(to_error)?;
        connection
            .execute("VACUUM INTO ?1", [temporary.to_string_lossy().as_ref()])
            .map_err(to_error)?;
        drop(connection);

        let verification = Connection::open(&temporary).map_err(to_error)?;
        let integrity: String = verification
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(to_error)?;
        drop(verification);
        if integrity != "ok" {
            let _ = fs::remove_file(&temporary);
            return Err(format!("Backup integrity check failed: {integrity}"));
        }
        if protected_file.exists() {
            fs::remove_file(&protected_file).map_err(to_error)?;
        }
        fs::rename(&temporary, &protected_file).map_err(to_error)?;
    }

    let mut paths = vec![protected_file.to_string_lossy().to_string()];
    let mut errors = Vec::new();
    for root in fixed_drive_roots() {
        let directory = root.join("BhojPatra Backups");
        if directory == protected_directory {
            continue;
        }
        match copy_backup_file(&protected_file, &directory, &file_name, force) {
            Ok(path) => {
                let value = path.to_string_lossy().to_string();
                if !paths.contains(&value) {
                    paths.push(value);
                }
            }
            Err(error) => errors.push(format!("{}: {error}", directory.display())),
        }
    }

    let size_bytes = fs::metadata(&protected_file).map_err(to_error)?.len();
    Ok(LocalBackupResult {
        date,
        file_name,
        created,
        size_bytes,
        paths,
        errors,
    })
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
        let mut delete = Command::new("netsh.exe");
        delete
            .args([
                "advfirewall",
                "firewall",
                "delete",
                "rule",
                &format!("name={name}"),
            ])
            .creation_flags(CREATE_NO_WINDOW);
        let _ = delete.output();

        let mut add = Command::new("netsh.exe");
        add.args([
            "advfirewall",
            "firewall",
            "add",
            "rule",
            &format!("name={name}"),
            "dir=in",
            "action=allow",
            &format!("protocol={protocol}"),
            &format!("localport={port}"),
            "profile=any",
            "edge=yes",
            &format!("description={description}"),
        ])
        .creation_flags(CREATE_NO_WINDOW);
        let _ = add.output();
    }
}

#[cfg(not(windows))]
fn ensure_windows_firewall_rules() {}

fn read_json(connection: &Connection, key: &str) -> Result<Option<Value>, String> {
    let mut candidates = Vec::new();
    if let Some(stored) = connection
        .query_row("SELECT value FROM app_state WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .optional()
        .map_err(to_error)?
    {
        candidates.push(stored);
    }
    let mut statement = connection
        .prepare("SELECT value FROM app_state_history WHERE key = ?1 ORDER BY id DESC LIMIT 20")
        .map_err(to_error)?;
    let history = statement
        .query_map([key], |row| row.get::<_, String>(0))
        .map_err(to_error)?;
    for value in history.flatten() {
        candidates.push(value);
    }
    for payload in candidates {
        if let Ok(value) = serde_json::from_str(&payload) {
            return Ok(Some(value));
        }
    }
    Ok(None)
}

fn write_json(connection: &Connection, key: &str, value: &Value) -> Result<(), String> {
    let payload = serde_json::to_string(value).map_err(to_error)?;
    connection
        .execute(
            "INSERT INTO app_state_history (key, value)
             SELECT key, value FROM app_state WHERE key = ?1 AND value <> ?2",
            params![key, payload],
        )
        .map_err(to_error)?;
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
    connection
        .execute(
            "DELETE FROM app_state_history
             WHERE key = ?1 AND id NOT IN (
               SELECT id FROM app_state_history WHERE key = ?1 ORDER BY id DESC LIMIT 20
             )",
            [key],
        )
        .map_err(to_error)?;
    Ok(())
}

fn state_updated_at(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT updated_at FROM app_state WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_error)
}

fn normalize_login(value: &str) -> String {
    value.trim().to_lowercase()
}

fn parse_staff_accounts(value: Option<Value>) -> Vec<LanStaffAccount> {
    value
        .and_then(|payload| serde_json::from_value::<Vec<LanStaffAccount>>(payload).ok())
        .unwrap_or_default()
}

fn is_open_order_value(order: &Value) -> bool {
    let status = order
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    !order
        .get("isClosed")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        && order.get("closedAt").is_none()
        && !matches!(status, "paid" | "cancelled" | "void")
}

fn snapshot_has_active_table_without_items(snapshot: &Value) -> bool {
    let Some(payload) = snapshot.as_object() else {
        return false;
    };
    let tables = payload
        .get("tables")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let orders = payload
        .get("orders")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let order_items = payload
        .get("orderItems")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let saved_carts = payload.get("savedCarts").and_then(Value::as_object);

    tables.iter().any(|table| {
        let Some(table_id) = table.get("id").and_then(Value::as_str) else {
            return false;
        };
        let Some(order_id) = table.get("activeOrderId").and_then(Value::as_str) else {
            return false;
        };
        let Some(order) = orders
            .iter()
            .find(|candidate| candidate.get("id").and_then(Value::as_str) == Some(order_id))
        else {
            return false;
        };
        if !is_open_order_value(order) {
            return false;
        }
        let has_items = order_items.iter().any(|item| {
            item.get("orderId").and_then(Value::as_str) == Some(order_id)
                && item.get("status").and_then(Value::as_str) != Some("cancelled")
        });
        let has_cart = saved_carts
            .and_then(|carts| carts.get(table_id))
            .and_then(Value::as_array)
            .is_some_and(|cart| !cart.is_empty());
        !has_items && !has_cart
    })
}

fn snapshot_restores_active_table_cart(current: &Value, candidate: &Value) -> bool {
    let Some(current_payload) = current.as_object() else {
        return false;
    };
    let Some(candidate_payload) = candidate.as_object() else {
        return false;
    };
    let current_tables = current_payload
        .get("tables")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let candidate_tables = candidate_payload
        .get("tables")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let candidate_orders = candidate_payload
        .get("orders")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let candidate_carts = candidate_payload
        .get("savedCarts")
        .and_then(Value::as_object);

    current_tables.iter().any(|current_table| {
        let Some(table_id) = current_table.get("id").and_then(Value::as_str) else {
            return false;
        };
        let Some(order_id) = current_table.get("activeOrderId").and_then(Value::as_str) else {
            return false;
        };
        let Some(cart) = candidate_carts
            .and_then(|carts| carts.get(table_id))
            .and_then(Value::as_array)
        else {
            return false;
        };
        if cart.is_empty() {
            return false;
        }
        let candidate_table_matches = candidate_tables.iter().any(|candidate_table| {
            candidate_table.get("id").and_then(Value::as_str) == Some(table_id)
                && candidate_table.get("activeOrderId").and_then(Value::as_str) == Some(order_id)
        });
        let candidate_order_open = candidate_orders.iter().any(|candidate_order| {
            candidate_order.get("id").and_then(Value::as_str) == Some(order_id)
                && is_open_order_value(candidate_order)
        });
        candidate_table_matches && candidate_order_open
    })
}

fn read_snapshot(connection: &Connection) -> Result<Option<Value>, String> {
    let current_raw = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            ["snapshot"],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error)?;

    let Some(current_raw) = current_raw else {
        return read_json(connection, "snapshot");
    };
    let Ok(current) = serde_json::from_str::<Value>(&current_raw) else {
        return read_json(connection, "snapshot");
    };
    if !snapshot_has_active_table_without_items(&current) {
        return Ok(Some(current));
    }

    // A previous build could save the table/order link but omit the parked
    // cart during shutdown. Recover the most recent history entry that still
    // contains the matching cart before exposing the local state to the UI.
    let mut statement = connection
        .prepare("SELECT value FROM app_state_history WHERE key = ?1 ORDER BY id DESC LIMIT 20")
        .map_err(to_error)?;
    let history = statement
        .query_map(["snapshot"], |row| row.get::<_, String>(0))
        .map_err(to_error)?;
    for raw in history.flatten() {
        if let Ok(candidate) = serde_json::from_str::<Value>(&raw) {
            if snapshot_restores_active_table_cart(&current, &candidate) {
                return Ok(Some(candidate));
            }
        }
    }
    Ok(Some(current))
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
    let matches_secret = |stored: &str| {
        if let Some(expected) = stored.strip_prefix("sha256$") {
            let actual = hex::encode(Sha256::digest(secret.as_bytes()));
            expected.eq_ignore_ascii_case(&actual)
        } else {
            stored == secret
        }
    };
    let valid_passwords = [Some(account.password.as_str()), account.pin.as_deref()];
    if !valid_passwords.into_iter().flatten().any(matches_secret) {
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

fn would_erase_core_restaurant_data(existing: Option<&Value>, incoming: &Value) -> bool {
    let Some(existing) = existing.and_then(Value::as_object) else {
        return false;
    };
    let Some(incoming) = incoming.as_object() else {
        return true;
    };
    ["tables", "floors", "menuItems", "menuCategories"]
        .iter()
        .any(|key| {
            let current_count = existing
                .get(*key)
                .and_then(Value::as_array)
                .map_or(0, Vec::len);
            let next_count = incoming
                .get(*key)
                .and_then(Value::as_array)
                .map_or(0, Vec::len);
            current_count > 0 && next_count == 0
        })
}

fn preserves_role_restricted_collections(existing: Option<&Value>, incoming: &Value) -> bool {
    let Some(existing) = existing.and_then(Value::as_object) else {
        return true;
    };
    let Some(incoming) = incoming.as_object() else {
        return false;
    };
    [
        "outlet",
        "printSettings",
        "appUpdate",
        "menuCategories",
        "menuItems",
        "floors",
        "stations",
        "inventoryItems",
        "purchaseEntries",
        "payments",
    ]
    .iter()
    .all(|key| existing.get(*key) == incoming.get(*key))
}

fn sanitize_snapshot_for_lan(snapshot: &Value) -> Value {
    let mut sanitized = snapshot.clone();
    if let Some(cloud) = sanitized
        .get_mut("cloudSync")
        .and_then(Value::as_object_mut)
    {
        cloud.insert("accountSecret".to_string(), Value::String(String::new()));
    }
    sanitized
}

fn preserve_cloud_secret(existing: Option<&Value>, incoming: &Value) -> Value {
    let mut merged = incoming.clone();
    let existing_secret = existing
        .and_then(|value| value.get("cloudSync"))
        .and_then(|value| value.get("accountSecret"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if !existing_secret.is_empty() {
        if let Some(cloud) = merged.get_mut("cloudSync").and_then(Value::as_object_mut) {
            cloud.insert(
                "accountSecret".to_string(),
                Value::String(existing_secret.to_string()),
            );
        }
    }
    merged
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
    // Keep logos readable without turning them into a full-width banner.
    const MAX_WIDTH: u32 = 120;
    const MAX_HEIGHT: u32 = 80;
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
    out.extend_from_slice(&[0x1b, 0x61, 0x01]);
    // GS v 0 header
    out.extend_from_slice(&[0x1d, 0x76, 0x30, 0x00, x_l, x_h, y_l, y_h]);
    // Bitmap data
    out.extend_from_slice(&bitmap);
    // Newline + left align for the receipt text that follows.
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
    let address = if target.0.contains(':') {
        format!("[{}]:{}", target.0, target.1)
    } else {
        format!("{}:{}", target.0, target.1)
    };
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
fn print_windows_queue(printer: &str, job_name: &str, bytes: &[u8]) -> Result<(), String> {
    let mut printer_name = OsStr::new(printer)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut document_name = OsStr::new(job_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut data_type = OsStr::new("RAW")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut handle: HANDLE = ptr::null_mut();

    unsafe {
        if OpenPrinterW(printer_name.as_mut_ptr(), &mut handle, ptr::null()) == 0 {
            return Err(format!(
                "Could not open Windows printer '{printer}': {}",
                std::io::Error::last_os_error()
            ));
        }

        let document = DOC_INFO_1W {
            pDocName: document_name.as_mut_ptr(),
            pOutputFile: ptr::null_mut(),
            pDatatype: data_type.as_mut_ptr(),
        };
        if StartDocPrinterW(handle, 1, &document) == 0 {
            let error = std::io::Error::last_os_error();
            ClosePrinter(handle);
            return Err(format!("Could not start printer job: {error}"));
        }
        if StartPagePrinter(handle) == 0 {
            let error = std::io::Error::last_os_error();
            EndDocPrinter(handle);
            ClosePrinter(handle);
            return Err(format!("Could not start printer page: {error}"));
        }

        let mut offset = 0usize;
        while offset < bytes.len() {
            let count = (bytes.len() - offset).min(u32::MAX as usize) as u32;
            let mut written = 0u32;
            if WritePrinter(handle, bytes[offset..].as_ptr().cast(), count, &mut written) == 0 {
                let error = std::io::Error::last_os_error();
                EndPagePrinter(handle);
                EndDocPrinter(handle);
                ClosePrinter(handle);
                return Err(format!("Windows printer write failed: {error}"));
            }
            if written == 0 {
                EndPagePrinter(handle);
                EndDocPrinter(handle);
                ClosePrinter(handle);
                return Err("Windows printer accepted no receipt data.".to_string());
            }
            offset += written as usize;
        }

        let page_ended = EndPagePrinter(handle) != 0;
        let document_ended = EndDocPrinter(handle) != 0;
        ClosePrinter(handle);
        if !page_ended || !document_ended {
            return Err("Windows did not finish the printer job cleanly.".to_string());
        }
    }
    Ok(())
}

#[cfg(windows)]
fn query_windows_printers() -> Result<Vec<NativePrinter>, String> {
    unsafe fn wide_string(pointer: *const u16) -> String {
        if pointer.is_null() {
            return String::new();
        }
        let mut length = 0usize;
        while *pointer.add(length) != 0 {
            length += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(pointer, length))
    }

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed = 0u32;
    let mut returned = 0u32;
    unsafe {
        EnumPrintersW(
            flags,
            ptr::null(),
            5,
            ptr::null_mut(),
            0,
            &mut needed,
            &mut returned,
        );
    }
    if needed == 0 {
        return Ok(Vec::new());
    }
    let words = (needed as usize + std::mem::size_of::<usize>() - 1) / std::mem::size_of::<usize>();
    let mut buffer = vec![0usize; words];
    let ok = unsafe {
        EnumPrintersW(
            flags,
            ptr::null(),
            5,
            buffer.as_mut_ptr().cast(),
            needed,
            &mut needed,
            &mut returned,
        )
    };
    if ok == 0 {
        return Err(format!(
            "Could not enumerate Windows printers: {}",
            std::io::Error::last_os_error()
        ));
    }

    let mut default_length = 0u32;
    unsafe { GetDefaultPrinterW(ptr::null_mut(), &mut default_length) };
    let default_name = if default_length > 0 {
        let mut value = vec![0u16; default_length as usize];
        if unsafe { GetDefaultPrinterW(value.as_mut_ptr(), &mut default_length) } != 0 {
            String::from_utf16_lossy(
                &value[..value.iter().position(|ch| *ch == 0).unwrap_or(value.len())],
            )
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let rows = unsafe {
        std::slice::from_raw_parts(buffer.as_ptr().cast::<PRINTER_INFO_5W>(), returned as usize)
    };
    let mut printers = rows
        .iter()
        .filter_map(|row| {
            let name = unsafe { wide_string(row.pPrinterName) };
            if name.trim().is_empty() {
                return None;
            }
            let port_name = unsafe { wide_string(row.pPortName) };
            let label = [name.as_str(), port_name.as_str()]
                .into_iter()
                .filter(|part| !part.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" - ");
            let offline = row.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE != 0;
            Some(NativePrinter {
                is_default: name.eq_ignore_ascii_case(&default_name)
                    || row.Attributes & PRINTER_ATTRIBUTE_DEFAULT != 0,
                name,
                label,
                port_name,
                driver_name: String::new(),
                status: if offline { "offline" } else { "ready" }.to_string(),
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
fn load_local_state(app: AppHandle) -> Result<LocalStatePayload, String> {
    let connection = open_database(&app)?;
    Ok(LocalStatePayload {
        snapshot: read_json(&connection, "snapshot")?,
        staff: read_json(&connection, "staff")?,
    })
}

#[tauri::command]
fn save_local_state(
    app: AppHandle,
    write_lock: State<'_, DesktopStateWriteLock>,
    broadcaster: State<'_, broadcast::Sender<String>>,
    snapshot: Value,
    staff: Value,
) -> Result<(), String> {
    let _write_guard = write_lock
        .0
        .lock()
        .map_err(|_| "Desktop state save lock was poisoned".to_string())?;
    let connection = open_database(&app)?;
    let existing = read_snapshot(&connection)?;
    if (snapshot_score(Some(&snapshot)) == 0 && snapshot_score(existing.as_ref()) > 0)
        || would_erase_core_restaurant_data(existing.as_ref(), &snapshot)
    {
        return Err(
            "Refused to replace existing restaurant setup with an incomplete snapshot".to_string(),
        );
    }
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
fn create_daily_local_backup(
    app: AppHandle,
    write_lock: State<'_, DesktopStateWriteLock>,
    force: bool,
) -> Result<LocalBackupResult, String> {
    let _write_guard = write_lock
        .0
        .lock()
        .map_err(|_| "Desktop state backup lock was poisoned".to_string())?;
    create_local_backup(&app, force)
}

fn read_sync_rows(connection: &Connection, table: &str) -> Result<Vec<Value>, String> {
    let statement = format!("SELECT row_json FROM {table} ORDER BY rowid ASC");
    let mut query = connection.prepare(&statement).map_err(to_error)?;
    let rows = query
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_error)?;
    let mut values = Vec::new();
    for row in rows {
        let raw = row.map_err(to_error)?;
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            values.push(value);
        }
    }
    Ok(values)
}

#[tauri::command]
fn load_sync_metadata(app: AppHandle) -> Result<Value, String> {
    let connection = open_database(&app)?;
    let mut state_statement = connection
        .prepare("SELECT key, value FROM sync_state")
        .map_err(to_error)?;
    let state_rows = state_statement
        .query_map([], |row| {
            Ok(json!({ "key": row.get::<_, String>(0)?, "value": row.get::<_, String>(1)? }))
        })
        .map_err(to_error)?;
    let mut sync_state = Vec::new();
    for row in state_rows {
        sync_state.push(row.map_err(to_error)?);
    }
    Ok(json!({
        "records": read_sync_rows(&connection, "sync_records")?,
        "outbox": read_sync_rows(&connection, "sync_outbox")?,
        "state": sync_state,
        "conflicts": read_sync_rows(&connection, "sync_conflicts")?,
    }))
}

#[tauri::command]
fn save_sync_metadata(
    app: AppHandle,
    records: Vec<Value>,
    outbox: Vec<Value>,
    sync_state: Vec<Value>,
    conflicts: Vec<Value>,
) -> Result<(), String> {
    let mut connection = open_database(&app)?;
    let transaction = connection.transaction().map_err(to_error)?;
    transaction
        .execute("DELETE FROM sync_records", [])
        .map_err(to_error)?;
    transaction
        .execute("DELETE FROM sync_outbox", [])
        .map_err(to_error)?;
    transaction
        .execute("DELETE FROM sync_state", [])
        .map_err(to_error)?;
    transaction
        .execute("DELETE FROM sync_conflicts", [])
        .map_err(to_error)?;

    for row in records {
        transaction.execute(
            "INSERT INTO sync_records (key, entity_type, entity_id, order_uuid, version, base_version, payload_hash, updated_at, synced_at, conflict_state, row_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![row["key"].as_str(), row["entityType"].as_str(), row["entityId"].as_str(), row["orderUuid"].as_str(), row["version"].as_i64(), row["baseVersion"].as_i64(), row["payloadHash"].as_str(), row["updatedAt"].as_str(), row["syncedAt"].as_str(), row["conflictState"].as_str(), row.to_string()],
        ).map_err(to_error)?;
    }
    for row in outbox {
        transaction.execute(
            "INSERT INTO sync_outbox (key, entity_type, entity_id, order_uuid, version, base_version, payload_hash, updated_at, batch_id, retry_count, row_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![row["key"].as_str(), row["entityType"].as_str(), row["entityId"].as_str(), row["orderUuid"].as_str(), row["version"].as_i64(), row["baseVersion"].as_i64(), row["payloadHash"].as_str(), row["updatedAt"].as_str(), row["batchId"].as_str(), row["retryCount"].as_i64().unwrap_or(0), row.to_string()],
        ).map_err(to_error)?;
    }
    for row in sync_state {
        transaction
            .execute(
                "INSERT INTO sync_state (key, value) VALUES (?1, ?2)",
                params![row["key"].as_str(), row["value"].as_str()],
            )
            .map_err(to_error)?;
    }
    for row in conflicts {
        transaction.execute(
            "INSERT INTO sync_conflicts (key, entity_id, order_uuid, code, created_at, row_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![row["key"].as_str(), row["entityId"].as_str(), row["orderUuid"].as_str(), row["code"].as_str(), row["createdAt"].as_str(), row.to_string()],
        ).map_err(to_error)?;
    }
    transaction.commit().map_err(to_error)
}

#[tauri::command]
fn list_native_printers() -> Result<Vec<NativePrinter>, String> {
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
fn print_native(payload: NativePrintPayload) -> Result<(), String> {
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
        print_windows_queue(printer, &payload.job_name, &bytes)
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
    let stored_updated_at = state_updated_at(&connection, "snapshot").map_err(|error| {
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
        let safe_payload = sanitize_snapshot_for_lan(&payload);
        json!({
          "exists": true,
          "outletId": outlet.id,
          "tenantId": outlet.tenant_id,
          "updatedAt": stored_updated_at.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
          "payload": safe_payload,
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
    if !["owner", "admin", "manager", "captain", "kitchen"].contains(&account.role.as_str()) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "This role cannot update restaurant state" })),
        ));
    }
    if ["captain", "kitchen"].contains(&account.role.as_str())
        && !preserves_role_restricted_collections(existing.as_ref(), &body.payload)
    {
        return Err((
            StatusCode::FORBIDDEN,
            Json(
                json!({ "error": "This role can only update tables, orders, and kitchen workflow" }),
            ),
        ));
    }
    let existing_updated_at = state_updated_at(&connection, "snapshot").map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    if let (Some(expected), Some(actual)) = (&body.expected_updated_at, &existing_updated_at) {
        if expected != actual {
            return Err((
                StatusCode::CONFLICT,
                Json(json!({
                  "error": "Restaurant data changed on another device. Refresh and retry.",
                  "updatedAt": actual,
                  "payload": existing.as_ref().map(sanitize_snapshot_for_lan),
                })),
            ));
        }
    }
    let incoming_score = snapshot_score(Some(&body.payload));
    let existing_score = snapshot_score(existing.as_ref());
    if (incoming_score == 0 && existing_score > 0)
        || would_erase_core_restaurant_data(existing.as_ref(), &body.payload)
    {
        return Ok(Json(json!({
          "ok": true,
          "outletId": outlet_id,
          "updatedAt": existing_updated_at.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
          "skipped": true,
          "reason": "Ignored a snapshot that would erase existing restaurant setup data",
          "payload": existing.as_ref().map(sanitize_snapshot_for_lan),
        })));
    }

    let mut stored_payload = preserve_cloud_secret(existing.as_ref(), &body.payload);
    if ["captain", "kitchen"].contains(&account.role.as_str()) {
        if let Some(existing_cloud) = existing.as_ref().and_then(|value| value.get("cloudSync")) {
            if let Some(root) = stored_payload.as_object_mut() {
                root.insert("cloudSync".to_string(), existing_cloud.clone());
            }
        }
    }
    write_json(&connection, "snapshot", &stored_payload).map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        )
    })?;
    let updated_at = chrono::Utc::now().to_rfc3339();
    let public_event = json!({
      "type": "STATE_UPDATED",
      "outletId": outlet_id,
      "payload": sanitize_snapshot_for_lan(&stored_payload),
      "timestamp": updated_at,
      "clientId": body.client_id,
    });
    let _ = state.broadcaster.send(public_event.to_string());
    let _ = state.app.emit("lan_state_updated", &stored_payload);

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
                if text.as_str() == "ping" {
                  let _ = sender.send(Message::Text("pong".into())).await;
                  continue;
                }
                let event = match serde_json::from_str::<Value>(&text) {
                  Ok(value) => value,
                  Err(_) => continue,
                };
                // State writes must go through the authenticated HTTP endpoint so
                // empty-snapshot and optimistic-concurrency guards cannot be bypassed.
                if event.get("type").and_then(Value::as_str) != Some("STATE_UPDATED") {
                  let _ = state.broadcaster.send(event.to_string());
                }
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

fn spawn_lan_discovery_responder(app: AppHandle) {
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
    status: Arc<Mutex<LanServerStatusPayload>>,
    broadcaster: broadcast::Sender<String>,
) {
    let port = status.lock().map(|value| value.port).unwrap_or(3000);
    let shared_state = LanServerState {
        app: app.clone(),
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
            app.manage(DesktopStateWriteLock::default());
            let lan_status = Arc::new(Mutex::new(lan_status_snapshot(3000, false, None)));
            let (lan_broadcaster, _) = broadcast::channel::<String>(128);
            spawn_lan_server(
                app.handle().clone(),
                lan_status.clone(),
                lan_broadcaster.clone(),
            );
            spawn_lan_discovery_responder(app.handle().clone());
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
            load_sync_metadata,
            save_sync_metadata,
            create_daily_local_backup,
            get_lan_server_status,
            list_native_printers,
            print_native
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ipv4_and_ipv6_raw_printer_targets() {
        assert_eq!(
            network_target("tcp://192.168.1.50:9100"),
            Some(("192.168.1.50".to_string(), 9100))
        );
        assert_eq!(
            network_target("[::1]:9100"),
            Some(("::1".to_string(), 9100))
        );
    }

    #[test]
    fn builds_esc_pos_job_with_qr_and_cut() {
        let payload = NativePrintPayload {
            printer: "POS-80".to_string(),
            job_name: "Test receipt".to_string(),
            text: "BHOJPATRA\n".to_string(),
            auto_cut: true,
            open_cash_drawer: true,
            qr_codes: vec![NativeQrCode {
                data: "upi://pay?pa=test".to_string(),
                label: Some("Scan".to_string()),
            }],
            logo_data_url: None,
        };
        let bytes = esc_pos_bytes(&payload);
        assert!(bytes.starts_with(&[0x1b, 0x40, 0x1b, 0x70]));
        assert!(bytes
            .windows(b"BHOJPATRA".len())
            .any(|window| window == b"BHOJPATRA"));
        assert!(bytes
            .windows(b"upi://pay?pa=test".len())
            .any(|window| window == b"upi://pay?pa=test"));
        assert!(bytes.ends_with(&[0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]));
    }
}
