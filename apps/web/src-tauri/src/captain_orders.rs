//! Atomic, append-only captain commands. Prices and identity come from Desk,
//! never from a client-supplied restaurant snapshot.
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptainCommand {
    pub request_id: String,
    pub table_id: String,
    pub expected_order_id: Option<String>,
    #[serde(default = "default_action")]
    pub action: String,
    #[serde(default)]
    pub items: Vec<CaptainLine>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
}
fn default_action() -> String {
    "send_kot".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptainLine {
    pub menu_item_id: String,
    pub quantity: u32,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub modifier_ids: Vec<String>,
}

fn list(value: &Value, key: &str) -> Vec<Value> {
    value[key].as_array().cloned().unwrap_or_default()
}
fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn n(v: &Value, key: &str) -> i64 {
    v[key].as_i64().unwrap_or(0)
}
fn closed(v: &Value) -> bool {
    v["isClosed"] == true
        || !s(v, "closedAt").is_empty()
        || ["paid", "cancelled", "void"].contains(&s(v, "status"))
}
fn next_number(values: &[Value], key: &str, prefix: &str) -> String {
    let max = values
        .iter()
        .filter_map(|v| s(v, key).strip_prefix(prefix)?.parse::<u64>().ok())
        .max()
        .unwrap_or(0);
    format!("{prefix}{:04}", max + 1)
}

pub fn section_price(menu: &Value, floor: &Value) -> i64 {
    let field = match s(floor, "menuPriceOption") {
        "mrp" => "mrpPaise",
        "special" => "specialPricePaise",
        "online" => "onlinePricePaise",
        "delivery" => "deliveryPricePaise",
        "takeaway" => "takeawayPricePaise",
        _ => "pricePaise",
    };
    let base = menu[field].as_i64().unwrap_or(n(menu, "pricePaise")).max(0);
    let adjustment = floor["priceAdjustmentValue"]
        .as_f64()
        .unwrap_or(0.0)
        .max(0.0);
    let price = if s(floor, "priceAdjustmentType") == "amount" {
        base as f64 + adjustment
    } else {
        base as f64 * (1.0 + adjustment / 100.0)
    };
    price.round() as i64
}

fn category_rule(snapshot: &Value, id: &str) -> Value {
    let categories = list(snapshot, "menuCategories");
    let mut chain = vec![];
    let mut seen = HashSet::new();
    let mut current = id.to_string();
    while seen.insert(current.clone()) {
        let Some(category) = categories.iter().find(|v| s(v, "id") == current) else {
            break;
        };
        chain.push(category);
        current = s(category, "parentId").to_string();
    }
    let mut rule = json!({});
    let liquor = chain.iter().any(|category| {
        s(category, "name")
            .split(|c: char| !c.is_alphabetic())
            .any(|word| {
                [
                    "liquor", "alcohol", "beer", "wine", "whisky", "whiskey", "rum", "vodka",
                    "gin", "brandy", "scotch", "tequila", "bar",
                ]
                .contains(&word.to_lowercase().as_str())
            })
    });
    rule["separateBill"] = json!(liquor);
    for category in chain.into_iter().rev() {
        for key in ["taxPercent", "taxType", "discountPercent", "separateBill"] {
            if !category[key].is_null() {
                rule[key] = category[key].clone();
            }
        }
    }
    rule
}

/// Returns (snapshot, duplicate). Called while holding the desktop write lock.
pub fn apply_command(
    snapshot: &Value,
    command: &CaptainCommand,
    user_id: &str,
    user_name: &str,
    now: &str,
) -> Result<(Value, bool), String> {
    if command.request_id.len() < 12
        || command.request_id.len() > 100
        || !command
            .request_id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid request ID".into());
    }
    let marker = format!("captain_{}", command.request_id);
    if list(snapshot, "auditLogs")
        .iter()
        .any(|v| s(v, "id") == marker)
        || list(snapshot, "kots")
            .iter()
            .any(|v| s(v, "id").starts_with(&format!("{marker}_")))
    {
        return Ok((snapshot.clone(), true));
    }
    if !["send_kot", "request_bill"].contains(&command.action.as_str()) {
        return Err("Unsupported captain action".into());
    }
    let mut next = snapshot.clone();
    let mut tables = list(&next, "tables");
    let table_index = tables
        .iter()
        .position(|v| s(v, "id") == command.table_id)
        .ok_or("Table not found")?;
    let table = tables[table_index].clone();
    if ["dirty", "reserved", "payment_pending"].contains(&s(&table, "status")) {
        return Err("Ask the counter to make this table available first".into());
    }
    let mut orders = list(&next, "orders");
    let active = s(&table, "activeOrderId");
    if let Some(expected) = command
        .expected_order_id
        .as_deref()
        .filter(|s| !s.is_empty())
    {
        if expected != active {
            return Err("This table was checked out or changed. Review the table before sending a new order".into());
        }
    }
    let order_index = orders.iter().position(|v| s(v, "id") == active);
    if let Some(index) = order_index {
        if closed(&orders[index])
            || ["billed"].contains(&s(&orders[index], "status"))
            || n(&orders[index], "paidPaise") > 0
        {
            return Err(
                "This bill is already being settled. Ask the counter before adding items".into(),
            );
        }
    } else if !active.is_empty() {
        return Err("Table order is unavailable; refresh the desktop".into());
    }
    if command.action == "request_bill" {
        let index = order_index.ok_or("Send an order before requesting the bill")?;
        orders[index]["updatedAt"] = json!(now);
        orders[index]["version"] = json!(n(&orders[index], "version").max(1) + 1);
        tables[table_index]["status"] = json!("bill_requested");
        // bill_requested is a table status, not a valid OrderStatus.
        next["orders"] = json!(orders);
        next["tables"] = json!(tables);
        add_audit(
            &mut next,
            &marker,
            "captain.bill_requested",
            &command.table_id,
            user_id,
            user_name,
            now,
        );
        return Ok((next, false));
    }
    if command.items.is_empty() || command.items.len() > 100 {
        return Err("Choose 1 to 100 order lines".into());
    }
    let floor = list(&next, "floors")
        .into_iter()
        .find(|v| s(v, "id") == s(&table, "floorId"))
        .unwrap_or(json!({}));
    let menu = list(&next, "menuItems");
    let mut order = order_index.map(|i| orders[i].clone()).unwrap_or_else(|| json!({
        "id": format!("ord_{}", command.request_id), "orderUuid": format!("ord_{}", command.request_id),
        "version": 0, "isClosed": false, "outletId": next["outlet"]["id"],
        "orderNo": next_number(&orders, "orderNo", "ORD-"), "businessDate": now.get(..10).unwrap_or(now),
        "type": "dine_in", "status": "running", "tableId": command.table_id,
        "tableName": table["name"], "captainUserId": user_id, "captainName": user_name,
        "subtotalPaise": 0, "discountPaise": 0, "taxPaise": 0, "chargePaise": 0,
        "totalPaise": 0, "paidPaise": 0, "paymentStatus": "unpaid", "createdAt": now, "updatedAt": now,
    }));
    let order_id = s(&order, "id").to_string();
    let mut order_items = list(&next, "orderItems");
    let mut created = vec![];
    for (index, line) in command.items.iter().enumerate() {
        if line.quantity == 0 || line.quantity > 999 || line.note.chars().count() > 500 {
            return Err("Invalid quantity or kitchen note".into());
        }
        let item = menu
            .iter()
            .find(|v| s(v, "id") == line.menu_item_id)
            .ok_or("A selected product no longer exists")?;
        if item["isAvailable"] == false
            || item["activeOnApp"] == false
            || s(item, "productType") == "purchase_only"
        {
            return Err(format!("{} is not available for ordering", s(item, "name")));
        }
        let selected: HashSet<_> = line.modifier_ids.iter().collect();
        if selected.len() != line.modifier_ids.len() {
            return Err("Duplicate extras selected".into());
        }
        let mut matched = 0;
        let mut extras = 0;
        let mut modifiers = vec![];
        for group in list(item, "modifierGroups") {
            let mut count = 0;
            for modifier in list(&group, "modifiers") {
                if selected.contains(&s(&modifier, "id").to_string()) {
                    count += 1;
                    matched += 1;
                    extras += n(&modifier, "pricePaise").max(0);
                    modifiers.push(if n(&modifier, "pricePaise") > 0 {
                        format!(
                            "{} (+{:.2})",
                            s(&modifier, "name"),
                            n(&modifier, "pricePaise") as f64 / 100.0
                        )
                    } else {
                        s(&modifier, "name").to_string()
                    });
                }
            }
            if count < n(&group, "minSelect") || count > n(&group, "maxSelect").max(1) {
                return Err(format!("Check extras for {}", s(item, "name")));
            }
        }
        if matched != selected.len() {
            return Err("A selected extra no longer exists".into());
        }
        let price = section_price(item, &floor) + extras;
        let subtotal = price * line.quantity as i64;
        let rule = category_rule(&next, s(item, "categoryId"));
        let tax_type = rule["taxType"].as_str().unwrap_or(s(item, "taxType"));
        let tax_percent = if tax_type == "None" {
            0.0
        } else {
            rule["taxPercent"]
                .as_f64()
                .unwrap_or(item["taxPercent"].as_f64().unwrap_or(0.0))
        };
        let discount_percent = rule["discountPercent"]
            .as_f64()
            .unwrap_or(0.0)
            .clamp(0.0, 100.0);
        let discount = (subtotal as f64 * discount_percent / 100.0).round() as i64;
        let tax = ((subtotal - discount) as f64 * tax_percent / 100.0).round() as i64;
        let separate = rule["separateBill"]
            .as_bool()
            .unwrap_or(item["isSeparateBill"].as_bool().unwrap_or(false));
        created.push(json!({
            "id": format!("oi_{}_{}", command.request_id, index), "orderId": order_id,
            "menuItemId": line.menu_item_id, "nameSnapshot": item["name"], "itemType": item["itemType"],
            "quantity": line.quantity, "unitPricePaise": price, "taxPercent": tax_percent,
            "taxType": if tax_type.is_empty() { "GST" } else { tax_type }, "taxPaise": tax,
            "discountPaise": discount, "totalPaise": subtotal - discount + tax, "isSeparateBill": separate,
            "stationId": item["stationId"], "status": "kot_sent", "note": line.note.trim(),
            "modifiers": modifiers, "createdAt": now,
        }));
    }
    let mut kots = list(&next, "kots");
    let stations: Vec<String> =
        created
            .iter()
            .map(|v| s(v, "stationId").to_string())
            .fold(vec![], |mut ids, id| {
                if !ids.contains(&id) {
                    ids.push(id);
                }
                ids
            });
    for (index, station) in stations.iter().enumerate() {
        let kot_id = format!("{marker}_{index}");
        let items: Vec<_> = created.iter().filter(|v| s(v, "stationId") == station).map(|item| json!({
            "id": format!("ki_{}", s(item, "id")), "kotId": kot_id, "orderItemId": item["id"],
            "name": item["nameSnapshot"], "quantity": item["quantity"], "note": item["note"],
            "modifiers": item["modifiers"], "itemType": item["itemType"], "status": "new",
        })).collect();
        kots.push(json!({
            "id": kot_id, "orderId": order_id, "orderNo": order["orderNo"],
            "kotNo": next_number(&kots, "kotNo", "KOT-"), "tableName": table["name"],
            "orderType": "dine_in", "stationId": if station.is_empty() { Value::Null } else { json!(station) },
            "status": "new", "captainName": user_name, "createdByUserId": user_id, "createdAt": now, "items": items,
        }));
    }
    order_items.extend(created);
    let active_items: Vec<_> = order_items
        .iter()
        .filter(|v| s(v, "orderId") == order_id && s(v, "status") != "cancelled")
        .collect();
    let subtotal: i64 = active_items
        .iter()
        .map(|v| n(v, "unitPricePaise") * n(v, "quantity"))
        .sum();
    let discount: i64 = active_items.iter().map(|v| n(v, "discountPaise")).sum();
    let tax: i64 = active_items.iter().map(|v| n(v, "taxPaise")).sum();
    order["subtotalPaise"] = json!(subtotal);
    order["taxPaise"] = json!(tax);
    order["discountPaise"] = json!(discount);
    order["totalPaise"] =
        json!(subtotal - discount + tax + n(&order, "chargePaise") + n(&order, "tipPaise"));
    order["status"] = json!("kot_sent");
    order["updatedAt"] = json!(now);
    order["version"] = json!(n(&order, "version") + 1);
    for (key, value) in [
        ("customerName", &command.customer_name),
        ("customerPhone", &command.customer_phone),
    ] {
        if let Some(value) = value {
            if value.chars().count() > 120 {
                return Err("Customer field is too long".into());
            }
            if !value.trim().is_empty() {
                order[key] = json!(value.trim());
            }
        }
    }
    if let Some(index) = order_index {
        orders[index] = order;
    } else {
        orders.push(order);
    }
    tables[table_index]["activeOrderId"] = json!(order_id);
    tables[table_index]["status"] = json!("kot_sent");
    next["orders"] = json!(orders);
    next["orderItems"] = json!(order_items);
    next["kots"] = json!(kots);
    next["tables"] = json!(tables);
    add_audit(
        &mut next,
        &marker,
        "captain.kot_sent",
        &order_id,
        user_id,
        user_name,
        now,
    );
    Ok((next, false))
}

fn add_audit(
    snapshot: &mut Value,
    id: &str,
    action: &str,
    entity_id: &str,
    user_id: &str,
    user_name: &str,
    now: &str,
) {
    let mut logs = list(snapshot, "auditLogs");
    logs.push(
        json!({ "id": id, "action": action, "entityType": "order", "entityId": entity_id,
        "outletId": snapshot["outlet"]["id"], "userId": user_id, "userName": user_name,
        "description": "Captain LAN command", "createdAt": now }),
    );
    snapshot["auditLogs"] = json!(logs);
}

/// A counter save may already be queued when a LAN command commits. Protect
/// those newly committed aggregates until the counter has acknowledged them.
pub fn protect_unseen(
    existing: &Value,
    incoming: &Value,
    pending: &[String],
) -> (Value, Vec<String>) {
    let mut next = incoming.clone();
    let mut remaining = vec![];
    for marker in pending {
        if list(incoming, "auditLogs")
            .iter()
            .any(|v| s(v, "id") == marker)
            || list(incoming, "kots")
                .iter()
                .any(|v| s(v, "id").starts_with(&format!("{marker}_")))
        {
            continue;
        }
        let Some(receipt) = list(existing, "auditLogs")
            .into_iter()
            .find(|v| s(v, "id") == marker)
        else {
            continue;
        };
        remaining.push(marker.clone());
        let entity = s(&receipt, "entityId");
        let order = list(existing, "orders")
            .into_iter()
            .find(|v| s(v, "id") == entity || s(v, "tableId") == entity && !closed(v));
        let Some(order) = order else {
            continue;
        };
        let id = s(&order, "id");
        let table_id = s(&order, "tableId");
        let mut orders = list(&next, "orders");
        orders.retain(|v| s(v, "id") != id);
        orders.push(order.clone());
        next["orders"] = json!(orders);
        for key in ["orderItems", "kots"] {
            let mut values = list(&next, key);
            values.retain(|v| s(v, "orderId") != id);
            values.extend(
                list(existing, key)
                    .into_iter()
                    .filter(|v| s(v, "orderId") == id),
            );
            next[key] = json!(values);
        }
        let mut tables = list(&next, "tables");
        for table in &mut tables {
            if s(table, "id") == table_id {
                if let Some(saved) = list(existing, "tables")
                    .into_iter()
                    .find(|v| s(v, "id") == table_id)
                {
                    *table = saved;
                }
            }
        }
        next["tables"] = json!(tables);
        let mut logs = list(&next, "auditLogs");
        logs.push(receipt);
        next["auditLogs"] = json!(logs);
    }
    (next, remaining)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Value {
        json!({
            "outlet": {"id":"out_test"}, "floors":[{"id":"ac", "menuPriceOption":"special", "priceAdjustmentValue":10}],
            "tables":[{"id":"t1", "name":"T1", "floorId":"ac", "status":"available"}],
            "menuCategories":[{"id":"food", "taxPercent":5, "taxType":"GST"}],
            "menuItems":[{"id":"tea","name":"Tea", "pricePaise":2000,"specialPricePaise":3000,"categoryId":"food", "stationId":"kitchen", "itemType":"veg"}],
            "orders":[],"orderItems":[],"kots":[],"payments":[],"savedCarts":{"t1":[{"menuItemId":"desktop_draft"}]}, "cloudSync":{"enabled":false}
        })
    }
    fn command(id: &str) -> CaptainCommand {
        serde_json::from_value(json!({"requestId":id,"tableId":"t1","items":[{"menuItemId":"tea","quantity":5,"note":"Less sugar"}]})).unwrap()
    }
    #[test]
    fn section_tax_identity_and_desktop_drafts() {
        let (next, dup) = apply_command(
            &fixture(),
            &command("request_000001"),
            "cap1",
            "Captain",
            "2026-10-07T12:00:00+05:30",
        )
        .unwrap();
        assert!(!dup);
        assert_eq!(next["orders"][0]["totalPaise"], 17325);
        assert_eq!(next["orderItems"][0]["unitPricePaise"], 3300);
        assert_eq!(next["kots"][0]["items"][0]["note"], "Less sugar");
        assert_eq!(next["orders"][0]["captainUserId"], "cap1");
        assert_eq!(next["savedCarts"], fixture()["savedCarts"]);
        assert_eq!(next["cloudSync"]["enabled"], false);
        let (retry, dup) = apply_command(
            &next,
            &command("request_000001"),
            "cap1",
            "Captain",
            "later",
        )
        .unwrap();
        assert!(dup);
        assert_eq!(retry, next);
    }
    #[test]
    fn two_captains_append_without_replacing_first_order() {
        let (one, _) = apply_command(
            &fixture(),
            &command("request_000001"),
            "cap1",
            "Captain 1",
            "now",
        )
        .unwrap();
        let (two, _) =
            apply_command(&one, &command("request_000002"), "cap2", "Captain 2", "now").unwrap();
        assert_eq!(two["orders"].as_array().unwrap().len(), 1);
        assert_eq!(two["orderItems"].as_array().unwrap().len(), 2);
        assert_eq!(two["orders"][0]["totalPaise"], 34650);
        assert_ne!(two["kots"][0]["kotNo"], two["kots"][1]["kotNo"]);
    }
    #[test]
    fn rejects_closed_order_and_removed_product() {
        let (mut state, _) = apply_command(
            &fixture(),
            &command("request_000001"),
            "cap1",
            "Captain",
            "now",
        )
        .unwrap();
        state["orders"][0]["isClosed"] = json!(true);
        assert!(
            apply_command(&state, &command("request_000002"), "cap1", "Captain", "now").is_err()
        );
        let mut fresh = fixture();
        fresh["menuItems"][0]["isAvailable"] = json!(false);
        assert!(
            apply_command(&fresh, &command("request_000001"), "cap1", "Captain", "now").is_err()
        );
        let mut cmd = command("request_000001");
        cmd.expected_order_id = Some("old_closed_order".into());
        assert!(apply_command(&fixture(), &cmd, "cap1", "Captain", "now").is_err());
    }
    #[test]
    fn required_modifiers_and_atomic_validation() {
        let mut fresh = fixture();
        fresh["menuItems"][0]["modifierGroups"] = json!([{"id":"extras","minSelect":1,"maxSelect":1,"modifiers":[{"id":"milk","name":"Milk","pricePaise":500}]}]);
        let mut cmd = command("request_000001");
        assert!(apply_command(&fresh, &cmd, "c", "C", "now").is_err());
        cmd.items[0].modifier_ids.push("milk".into());
        let (next, _) = apply_command(&fresh, &cmd, "c", "C", "now").unwrap();
        assert_eq!(next["orderItems"][0]["unitPricePaise"], 3800);
        cmd.items[0].modifier_ids.push("bad".into());
        assert!(apply_command(&fresh, &cmd, "c", "C", "now").is_err());
    }
    #[test]
    fn bill_request_does_not_change_payments_or_order_status() {
        let (one, _) =
            apply_command(&fixture(), &command("request_000001"), "c", "C", "now").unwrap();
        let mut cmd = command("request_000002");
        cmd.action = "request_bill".into();
        cmd.items.clear();
        let (next, _) = apply_command(&one, &cmd, "c", "C", "now").unwrap();
        assert_eq!(next["tables"][0]["status"], "bill_requested");
        assert_eq!(next["orders"][0]["status"], "kot_sent");
        assert_eq!(next["payments"], one["payments"]);
    }
    #[test]
    fn a_queued_counter_save_cannot_erase_unseen_captain_items() {
        let old = fixture();
        let (committed, _) =
            apply_command(&old, &command("request_000001"), "c", "C", "now").unwrap();
        let pending = vec!["captain_request_000001".to_string()];
        let (protected, remaining) = protect_unseen(&committed, &old, &pending);
        assert_eq!(protected["orderItems"], committed["orderItems"]);
        assert_eq!(protected["tables"], committed["tables"]);
        assert_eq!(protected["savedCarts"], old["savedCarts"]);
        assert_eq!(remaining, pending);
        let (_, remaining) = protect_unseen(&committed, &protected, &pending);
        assert!(remaining.is_empty());
    }
}
