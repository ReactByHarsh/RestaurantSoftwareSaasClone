use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const DESKTOP_SOFTWARE_TYPES: &[&str] = &[
    "BhojPatra",
    "BhojPatra Desk - Restaurant Software",
    "BhojPatra Desk",
    "Bhojpatra",
    "bhojpatra",
];
const MOBILE_SOFTWARE_TYPES: &[&str] = &[
    "BhojPatra",
    "BhojPatra Desk - Restaurant Software",
    "BhojPatra Mobile",
    "BhojPatra Android",
    "BhojPatra Desk",
    "Bhojpatra",
    "bhojpatra",
];
const PRODUCTION_LICENSE_API_URL: &str =
    "https://rust-licensing-server.yash-v-shinde.workers.dev/api/verify";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const CLOCK_ROLLBACK_GRACE_MS: u64 = 5 * 60 * 1000;
const FORWARD_JUMP_LIMIT_MS: u64 = 30 * 24 * 60 * 60 * 1000;

const REQUEST_SIGNING_SECRET: &[u8] = b"BHOJPATRA_REQ_SIGN_K3Y_2026_S3CUR3_R4ND0M_V4LU3";
const RESPONSE_VERIFY_SECRET: &[u8] = b"BHOJPATRA_RSP_V3R1FY_K3Y_2026_S3CUR3_R4ND0M";
const ENCRYPTION_BASE_SECRET: &[u8] = b"BHOJPATRA_3NCRYPT_B4S3_K3Y_2026_LOCAL_D4T4_PR0T3CT";

enum VerifyRemoteError {
    ServerRejected(String),
    TemporaryFailure(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default, rename_all = "camelCase")]
pub struct LicenseData {
    pub key: Option<String>,
    pub status: String,
    pub last_check: u64,
    pub expiry: Option<u64>,
    pub last_known_date: u64,
    pub client_name: Option<String>,
    pub software_type: Option<String>,
    pub plan_type: Option<String>,
    pub offline_grace: bool,
}

impl Default for LicenseData {
    fn default() -> Self {
        Self {
            key: None,
            status: "invalid".to_string(),
            last_check: 0,
            expiry: None,
            last_known_date: 0,
            client_name: None,
            software_type: None,
            plan_type: None,
            offline_grace: false,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyResponse {
    valid: bool,
    expiry: Option<String>,
    license: Option<RemoteLicense>,
    message: Option<String>,
    error: Option<String>,
    signature: Option<String>,
    server_time: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VerifyErrorResponse {
    error: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteLicense {
    client_name: Option<String>,
    software_type: String,
    plan_type: Option<String>,
    status: String,
    expires_at: String,
}

#[derive(Clone)]
pub struct LicenseGuard(std::sync::Arc<std::sync::RwLock<bool>>);

impl LicenseGuard {
    pub fn new() -> Self {
        Self(std::sync::Arc::new(std::sync::RwLock::new(false)))
    }

    pub fn set_valid(&self, valid: bool) {
        if let Ok(mut lock) = self.0.write() {
            *lock = valid;
        }
    }

    pub fn is_valid(&self) -> bool {
        self.0.read().map(|lock| *lock).unwrap_or(false)
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn require_license(_guard: &tauri::State<'_, LicenseGuard>) -> Result<(), String> {
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn require_license(guard: &tauri::State<'_, LicenseGuard>) -> Result<(), String> {
    if guard.is_valid() {
        Ok(())
    } else {
        Err("Valid license required to use BhojPatra Desk".to_string())
    }
}

fn derive_encryption_key(machine_id: &str) -> [u8; 32] {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(ENCRYPTION_BASE_SECRET).expect("HMAC key");
    mac.update(machine_id.as_bytes());
    let result = mac.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result.into_bytes());
    key
}

fn encrypt_data(plaintext: &[u8], key: &[u8; 32]) -> Vec<u8> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use rand::RngCore;

    let cipher = Aes256Gcm::new_from_slice(key).expect("cipher");
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, plaintext).expect("encrypt");
    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    output
}

fn decrypt_data(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};

    if data.len() < 13 {
        return Err("License data is too short".to_string());
    }

    let (nonce_bytes, ciphertext) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).expect("cipher");
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "License data could not be decrypted on this device".to_string())
}

fn compute_request_signature(
    license_key: &str,
    machine_id: &str,
    software_type: &str,
    timestamp: u64,
) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;
    let message = format!(
        "{}:{}:{}:{}",
        license_key, machine_id, software_type, timestamp
    );
    let mut mac = HmacSha256::new_from_slice(REQUEST_SIGNING_SECRET).expect("HMAC key");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn requested_software_types() -> &'static [&'static str] {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        MOBILE_SOFTWARE_TYPES
    } else {
        DESKTOP_SOFTWARE_TYPES
    }
}

fn is_compatible_software_type(value: &str) -> bool {
    let normalized_value = normalize_software_type(value);
    requested_software_types()
        .iter()
        .any(|candidate| normalize_software_type(candidate) == normalized_value)
}

fn normalize_software_type(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn is_software_type_error(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("software")
        || normalized.contains("product")
        || normalized.contains("type")
        || normalized.contains("mismatch")
}

fn has_unexpired_saved_license(data: &LicenseData, now: u64) -> bool {
    data.expiry.map(|expiry| expiry > now).unwrap_or(false)
}

fn can_keep_saved_license_after_rejection(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    normalized.contains("unknown softwaretype") || normalized.contains("unknown software type")
}

fn verify_response_signature(
    signature: &str,
    valid: bool,
    license_key: &str,
    machine_id: &str,
    expiry: &str,
    server_time: &str,
) -> bool {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;
    let message = format!(
        "{}:{}:{}:{}:{}",
        valid, license_key, machine_id, expiry, server_time
    );
    let mut mac = HmacSha256::new_from_slice(RESPONSE_VERIFY_SECRET).expect("HMAC key");
    mac.update(message.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    if expected.len() != signature.len() {
        return false;
    }

    expected
        .bytes()
        .zip(signature.bytes())
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

pub struct LicenseManager {
    path: PathBuf,
    legacy_path: PathBuf,
    pub machine_id: String,
    encryption_key: [u8; 32],
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn get_machine_id(app_dir: &PathBuf) -> String {
    let _ = app_dir;
    machine_uid::get().unwrap_or_else(|_| "unknown".to_string())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn get_machine_id(app_dir: &PathBuf) -> String {
    let id_path = app_dir.join("mobile-install-id.txt");
    if let Ok(existing) = fs::read_to_string(&id_path) {
        let normalized = existing.trim();
        if !normalized.is_empty() {
            return normalized.to_string();
        }
    }

    let mut bytes = [0u8; 16];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut bytes);
    let generated = format!("mobile-{}", hex::encode(bytes));
    let _ = fs::write(id_path, &generated);
    generated
}

impl LicenseManager {
    pub fn new(app_handle: &AppHandle) -> Self {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("failed to get app data dir");
        std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
        let machine_id = get_machine_id(&app_dir);
        let encryption_key = derive_encryption_key(&machine_id);

        Self {
            path: app_dir.join("license-data.enc"),
            legacy_path: app_dir.join("license-data.json"),
            machine_id,
            encryption_key,
        }
    }

    pub fn get_status(&self) -> LicenseData {
        self.load_or_migrate()
    }

    pub async fn activate(&self, key: String) -> Result<String, String> {
        let normalized_key = Self::normalize_key(&key);
        let response = self
            .verify_remote(&normalized_key)
            .await
            .map_err(|error| error.into_message())?;
        if let Err(message) = self.persist_success(normalized_key, response, false) {
            self.invalidate_with_message(&message);
            return Err(message);
        }
        Ok("Activation successful".to_string())
    }

    pub async fn check_license(&self) -> bool {
        if self.check_tampering() {
            return false;
        }

        let data = self.load_or_migrate();
        let Some(key) = data.key.clone() else {
            return false;
        };

        let now = Self::now_millis();
        if let Some(expiry) = data.expiry {
            if expiry <= now {
                self.mark_invalid("expired");
                return false;
            }
        }

        match self.verify_remote(&key).await {
            Ok(response) => self.persist_success(key, response, false).is_ok(),
            Err(VerifyRemoteError::ServerRejected(message)) => {
                if can_keep_saved_license_after_rejection(&message)
                    && has_unexpired_saved_license(&data, now)
                {
                    let mut offline_data = data;
                    offline_data.status = "active".to_string();
                    offline_data.offline_grace = true;
                    offline_data.last_known_date = now.max(offline_data.last_known_date);
                    self.save(&offline_data);
                    true
                } else {
                    self.invalidate_with_message(&message);
                    false
                }
            }
            Err(VerifyRemoteError::TemporaryFailure(_)) => {
                if data.status == "active" || has_unexpired_saved_license(&data, now) {
                    let mut offline_data = data;
                    offline_data.status = "active".to_string();
                    offline_data.offline_grace = true;
                    offline_data.last_known_date = now.max(offline_data.last_known_date);
                    self.save(&offline_data);
                    true
                } else {
                    false
                }
            }
        }
    }

    fn load(&self) -> LicenseData {
        if let Ok(encrypted) = fs::read(&self.path) {
            if let Ok(plaintext) = decrypt_data(&encrypted, &self.encryption_key) {
                if let Ok(data) = serde_json::from_slice::<LicenseData>(&plaintext) {
                    return data;
                }
            }
        }
        LicenseData::default()
    }

    fn save(&self, data: &LicenseData) {
        if let Ok(json_bytes) = serde_json::to_vec_pretty(data) {
            let encrypted = encrypt_data(&json_bytes, &self.encryption_key);
            let _ = fs::write(&self.path, encrypted);
        }
    }

    fn load_or_migrate(&self) -> LicenseData {
        if self.legacy_path.exists() {
            if let Ok(content) = fs::read_to_string(&self.legacy_path) {
                if let Ok(data) = serde_json::from_str::<LicenseData>(&content) {
                    self.save(&data);
                    let _ = fs::remove_file(&self.legacy_path);
                    return data;
                }
            }
        }
        self.load()
    }

    fn now_millis() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    fn parse_time_millis(value: &str) -> Option<u64> {
        DateTime::parse_from_rfc3339(value)
            .ok()
            .map(|dt| dt.with_timezone(&Utc).timestamp_millis().max(0) as u64)
    }

    fn normalize_key(key: &str) -> String {
        key.trim().to_ascii_uppercase()
    }

    fn license_api_url() -> &'static str {
        option_env!("LICENSE_API_URL").unwrap_or(if cfg!(debug_assertions) {
            "http://127.0.0.1:8787/api/verify"
        } else {
            PRODUCTION_LICENSE_API_URL
        })
    }

    fn mark_invalid(&self, status: &str) {
        let mut data = self.load_or_migrate();
        data.status = status.to_string();
        data.offline_grace = false;
        self.save(&data);
    }

    fn invalidate_with_message(&self, message: &str) {
        self.mark_invalid(Self::status_from_failure(message));
    }

    fn status_from_failure(message: &str) -> &'static str {
        let normalized = message.to_ascii_lowercase();

        if normalized.contains("expired") {
            "expired"
        } else if normalized.contains("device mismatch") || normalized.contains("machine mismatch")
        {
            "device_mismatch"
        } else if normalized.contains("banned") || normalized.contains("revoked") {
            "revoked"
        } else if normalized.contains("not found") || normalized.contains("missing") {
            "missing"
        } else {
            "invalid"
        }
    }

    fn check_tampering(&self) -> bool {
        let mut data = self.load_or_migrate();
        let now = Self::now_millis();

        if data.last_known_date > 0
            && now < data.last_known_date.saturating_sub(CLOCK_ROLLBACK_GRACE_MS)
        {
            data.status = "invalid".to_string();
            data.offline_grace = false;
            self.save(&data);
            return true;
        }

        if data.last_known_date > 0
            && now > data.last_known_date.saturating_add(FORWARD_JUMP_LIMIT_MS)
        {
            data.status = "invalid".to_string();
            data.offline_grace = false;
            self.save(&data);
            return true;
        }

        if now > data.last_known_date {
            data.last_known_date = now;
            self.save(&data);
        }

        false
    }

    fn persist_success(
        &self,
        key: String,
        response: VerifyResponse,
        offline_grace: bool,
    ) -> Result<(), String> {
        let license = response.license.ok_or("Malformed license response")?;

        if !response.valid || license.status != "active" {
            return Err(response
                .message
                .unwrap_or_else(|| "License is not active".to_string()));
        }

        if !is_compatible_software_type(&license.software_type) {
            return Err(format!(
                "License is for {}, not {}",
                license.software_type,
                requested_software_types().join(" / ")
            ));
        }

        if let (Some(ref sig), Some(ref server_time)) = (&response.signature, &response.server_time)
        {
            let expiry_str = response.expiry.as_deref().unwrap_or(&license.expires_at);
            if !verify_response_signature(
                sig,
                response.valid,
                &key,
                &self.machine_id,
                expiry_str,
                server_time,
            ) {
                return Err("Response signature verification failed".to_string());
            }
        }

        let expiry = response
            .expiry
            .as_deref()
            .and_then(Self::parse_time_millis)
            .or_else(|| Self::parse_time_millis(&license.expires_at));
        let now = Self::now_millis();
        if let Some(expires_at) = expiry {
            if expires_at <= now {
                self.mark_invalid("expired");
                return Err("License expired".to_string());
            }
        }

        self.save(&LicenseData {
            key: Some(key),
            status: "active".to_string(),
            last_check: now,
            expiry,
            last_known_date: now,
            client_name: license.client_name,
            software_type: Some(license.software_type),
            plan_type: license.plan_type,
            offline_grace,
        });

        Ok(())
    }

    async fn verify_remote(&self, key: &str) -> Result<VerifyResponse, VerifyRemoteError> {
        if self.machine_id == "unknown" {
            return Err(VerifyRemoteError::TemporaryFailure(
                "Unable to read this device ID for license binding".to_string(),
            ));
        }

        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|error| VerifyRemoteError::TemporaryFailure(error.to_string()))?;

        let mut last_rejection: Option<String> = None;
        for software_type in requested_software_types() {
            let timestamp = Self::now_millis();
            let signature =
                compute_request_signature(key, &self.machine_id, software_type, timestamp);
            let body = serde_json::json!({
                "licenseKey": key,
                "machineId": self.machine_id,
                "softwareType": software_type,
                "timestamp": timestamp,
                "signature": signature
            });

            let response = client
                .post(Self::license_api_url())
                .json(&body)
                .send()
                .await
                .map_err(|error| {
                    VerifyRemoteError::TemporaryFailure(format!(
                        "Could not reach licensing server: {}",
                        error
                    ))
                })?;
            let status = response.status();
            let text = response
                .text()
                .await
                .map_err(|error| VerifyRemoteError::TemporaryFailure(error.to_string()))?;
            let parsed: Result<VerifyResponse, _> = serde_json::from_str(&text);
            let parsed = match parsed {
                Ok(value) => value,
                Err(_) => {
                    let server_message = serde_json::from_str::<VerifyErrorResponse>(&text)
                        .ok()
                        .and_then(|payload| payload.error.or(payload.message))
                        .filter(|message| !message.trim().is_empty())
                        .unwrap_or_else(|| {
                            format!("Unexpected licensing server response ({})", status)
                        });

                    if is_software_type_error(&server_message) {
                        last_rejection = Some(format!("{} ({})", server_message, status));
                        continue;
                    }

                    if status.as_u16() == 400
                        && server_message
                            .to_ascii_lowercase()
                            .contains("invalid verification request")
                    {
                        return Err(VerifyRemoteError::TemporaryFailure(format!(
                            "{}. Using saved offline license if available.",
                            server_message
                        )));
                    }

                    return Err(VerifyRemoteError::ServerRejected(format!(
                        "{} ({})",
                        server_message, status
                    )));
                }
            };

            if status.is_success() {
                return Ok(parsed);
            }

            let message = parsed
                .error
                .or(parsed.message)
                .unwrap_or_else(|| format!("License rejected by server ({})", status));
            last_rejection = Some(message.clone());
            if !is_software_type_error(&message) {
                return Err(VerifyRemoteError::ServerRejected(message));
            }
        }

        Err(VerifyRemoteError::ServerRejected(
            last_rejection.unwrap_or_else(|| "License rejected by server".to_string()),
        ))
    }
}

impl VerifyRemoteError {
    fn into_message(self) -> String {
        match self {
            Self::ServerRejected(message) | Self::TemporaryFailure(message) => message,
        }
    }
}
