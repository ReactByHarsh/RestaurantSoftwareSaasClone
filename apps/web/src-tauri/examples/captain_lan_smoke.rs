//! Local-only contract test server; never opens or changes restaurant data.
//! cargo run --example captain_lan_smoke
#[path = "../src/captain_orders.rs"]
mod captain_orders;
use axum::{
    extract::{
        ws::{Message, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;

#[derive(Clone)]
struct Fixture {
    snapshot: Arc<Mutex<Value>>,
    events: broadcast::Sender<String>,
}
fn authorized(headers: &HeaderMap) -> bool {
    headers.get("authorization").and_then(|h| h.to_str().ok())
        == Some("Basic Y2FwdGFpbkB0ZXN0LmxvY2FsOnRlc3Qtb25seQ==")
}
async fn command(
    State(state): State<Fixture>,
    headers: HeaderMap,
    Json(body): Json<captain_orders::CaptainCommand>,
) -> Result<Json<Value>, StatusCode> {
    if !authorized(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut snapshot = state.snapshot.lock().unwrap();
    let (next, duplicate) = captain_orders::apply_command(
        &snapshot,
        &body,
        "cap1",
        "Captain",
        "2026-10-07T12:00:00+05:30",
    )
    .map_err(|_| StatusCode::CONFLICT)?;
    *snapshot = next;
    if !duplicate {
        let _ = state
            .events
            .send(json!({"type":"STATE_UPDATED","payload":*snapshot}).to_string());
    }
    Ok(Json(
        json!({"ok":true,"duplicate":duplicate,"requestId":body.request_id,"payload":*snapshot}),
    ))
}
async fn state(
    State(state): State<Fixture>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    if !authorized(&headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(Json(
        json!({"exists":true,"updatedAt":"test-revision","payload":*state.snapshot.lock().unwrap()}),
    ))
}
async fn realtime(
    State(state): State<Fixture>,
    ws: WebSocketUpgrade,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |mut socket| async move {
        let mut events = state.events.subscribe();
        let _ = socket
            .send(Message::Text(json!({"type":"CONNECTED"}).to_string()))
            .await;
        while let Ok(event) = events.recv().await {
            if socket.send(Message::Text(event)).await.is_err() {
                break;
            }
        }
    })
}
#[tokio::main]
async fn main() {
    let fixture = Fixture {
        snapshot: Arc::new(Mutex::new(json!({
            "outlet":{"id":"out_test","tenantId":"tenant_test","name":"Contract Test Restaurant"},
            "tables":[{"id":"t1","name":"T1","floorId":"ac","status":"available","seats":4}],
            "floors":[{"id":"ac","name":"AC Section","menuPriceOption":"special","priceAdjustmentValue":10}],
            "menuCategories":[{"id":"food","taxType":"GST","taxPercent":5}],
            "menuItems":[{"id":"tea","name":"Tea","pricePaise":2000,"specialPricePaise":3000,"itemType":"veg","stationId":"kitchen","categoryId":"food"}],
            "orders":[],"orderItems":[],"kots":[],"payments":[],"cloudSync":{"enabled":false}
        }))),
        events: broadcast::channel(16).0,
    };
    let router=Router::new()
        .route("/api/v1/lan/hello",get(||async{Json(json!({"app":"bhojpatra-desk","outlet":{"id":"out_test","name":"Contract Test Restaurant"}}))}))
        .route("/api/v1/outlets/out_test/state",get(state))
        .route("/api/v1/outlets/out_test/captain/commands",post(command))
        .route("/api/v1/outlets/out_test/realtime",get(realtime)).with_state(fixture);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3008")
        .await
        .unwrap();
    println!("CAPTAIN_CONTRACT_READY http://127.0.0.1:3008 (isolated fixture)");
    axum::serve(listener, router).await.unwrap();
}
