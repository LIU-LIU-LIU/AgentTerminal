#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{env, fs, net::{TcpStream, ToSocketAddrs}, path::PathBuf, process::{Command, Stdio}, sync::Mutex, thread, time::{Duration, Instant, SystemTime}};
use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Emitter, Manager};

#[derive(Deserialize)]
struct ConnectionFile { url: String, token: String, #[allow(dead_code)] pid: Option<u32> }
#[derive(Serialize)]
struct Connection { endpoint: String, token: String }
struct HostState(Mutex<()>);

fn connection_path() -> Result<PathBuf, String> {
    if let Some(home) = env::var_os("AGENT_TERMINAL_HOME") { return Ok(PathBuf::from(home).join("connection.json")); }
    env::var_os("USERPROFILE").or_else(|| env::var_os("HOME"))
        .map(|home| PathBuf::from(home).join(".agentterminal").join("connection.json"))
        .ok_or_else(|| "无法定位用户目录，请设置 AGENT_TERMINAL_HOME".into())
}

fn read_connection(path: &PathBuf) -> Option<Connection> {
    let data: ConnectionFile = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let url = tauri::Url::parse(&data.url).ok()?;
    let host = url.host_str()?;
    if url.scheme() != "http" || !["127.0.0.1", "localhost", "::1", "[::1]"].contains(&host) || data.token.is_empty() { return None; }
    let port = url.port_or_known_default()?;
    let reachable = (host.trim_matches(['[', ']']), port).to_socket_addrs().ok()?.any(|address| TcpStream::connect_timeout(&address, Duration::from_millis(400)).is_ok());
    if !reachable { return None; }
    Some(Connection { endpoint: data.url.trim_end_matches('/').into(), token: data.token })
}

fn runtime_entry() -> Result<PathBuf, String> {
    if let Some(entry) = env::var_os("AGENT_TERMINAL_RUNTIME_ENTRY") {
        let path = PathBuf::from(entry);
        return if path.is_file() { Ok(path) } else { Err("AGENT_TERMINAL_RUNTIME_ENTRY 指定的文件不存在".into()) };
    }
    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            let portable = parent.join("runtime/dist/packages/runtime/src/index.js");
            if portable.is_file() { return Ok(portable); }
        }
    }
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    [root.join("dist/runtime/index.js"), root.join("dist/packages/runtime/src/index.js")]
        .into_iter().find(|p| p.is_file())
        .ok_or_else(|| "未找到已构建的 Runtime。请保留便携包 runtime 目录，或设置 AGENT_TERMINAL_RUNTIME_ENTRY。".into())
}

fn resolve_connection(state: &HostState) -> Result<Connection, String> {
    let _guard = state.0.lock().map_err(|_| "连接锁不可用")?;
    let path = connection_path()?;
    if let Some(connection) = read_connection(&path) { return Ok(connection); }
    let entry = runtime_entry()?;
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let log = fs::OpenOptions::new().create(true).append(true).open(path.with_file_name("desktop-runtime.log")).map_err(|e| e.to_string())?;
    let portable_node = env::current_exe().ok().and_then(|exe| exe.parent().map(|parent| parent.join("runtime/node.exe"))).filter(|node| node.is_file());
    let node = env::var_os("AGENT_TERMINAL_NODE").or_else(|| portable_node.map(|node| node.into_os_string())).unwrap_or_else(|| "node".into());
    let mut command = Command::new(node);
    command.arg(entry).stdin(Stdio::null()).stdout(log.try_clone().map_err(|e| e.to_string())?).stderr(log);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x00000008 | 0x00000200);
    }
    let mut child = command.spawn().map_err(|e| format!("无法启动 Runtime，请检查便携包或外部 Node.js：{e}"))?;
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if let Some(connection) = read_connection(&path) { return Ok(connection); }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { return Err(format!("Runtime 已退出 ({status})，请查看 desktop-runtime.log")); }
        thread::sleep(Duration::from_millis(250));
    }
    Err("等待 Runtime 超时，请检查 connection.json 与 desktop-runtime.log".into())
}

#[tauri::command]
async fn connection(state: tauri::State<'_, HostState>) -> Result<Connection, String> {
    resolve_connection(&state)
}

#[tauri::command]
async fn service_control(action: String, app: tauri::AppHandle) -> Result<(), String> {
    if action != "stop" && action != "restart" { return Err("无效服务操作".into()); }
    let entry = runtime_entry()?.with_file_name("service.js");
    let portable_node = env::current_exe().ok().and_then(|exe| exe.parent().map(|parent| parent.join("runtime/node.exe"))).filter(|node| node.is_file());
    let node = env::var_os("AGENT_TERMINAL_NODE").or_else(|| portable_node.map(|node| node.into_os_string())).unwrap_or_else(|| "node".into());
    let should_exit = action == "stop";
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(node);
        command.arg(entry).arg(action);
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command.output().map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())??;
    if !result.status.success() { return Err(String::from_utf8_lossy(&result.stderr).trim().to_string()); }
    if should_exit { app.exit(0); }
    Ok(())
}

#[derive(Serialize)]
struct IdeSettings { ide: String, text: String }

/// Returns the user settings of installed VS Code family editors, most recently used first,
/// so the UI can follow the terminal theme and font the user already works with.
#[tauri::command]
fn ide_settings() -> Vec<IdeSettings> {
    let mut roots = Vec::new();
    if let Some(appdata) = env::var_os("APPDATA") { roots.push(PathBuf::from(appdata)); }
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        roots.push(home.join("Library/Application Support"));
        roots.push(home.join(".config"));
    }
    let mut found = Vec::new();
    for root in &roots {
        for (ide, folder) in [("VS Code", "Code"), ("Cursor", "Cursor"), ("Windsurf", "Windsurf"), ("VS Code Insiders", "Code - Insiders"), ("VSCodium", "VSCodium"), ("Trae", "Trae")] {
            let user = root.join(folder).join("User");
            let Ok(text) = fs::read_to_string(user.join("settings.json")) else { continue };
            if text.len() > 1_000_000 { continue; }
            let used = [user.join("globalStorage/state.vscdb"), user.join("settings.json")].iter()
                .find_map(|path| fs::metadata(path).and_then(|meta| meta.modified()).ok()).unwrap_or(SystemTime::UNIX_EPOCH);
            found.push((used, IdeSettings { ide: ide.into(), text }));
        }
    }
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, settings)| settings).collect()
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Called by the floating monitor: brings the workspace window forward and shows the task's terminal.
#[tauri::command]
fn open_task(id: String, app: tauri::AppHandle) {
    show_main(&app);
    let _ = app.emit_to("main", "open-task", id);
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) { app.exit(0); }

fn main() {
    tauri::Builder::default().manage(HostState(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![connection, service_control, ide_settings, open_task, exit_app])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "完全退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main").tooltip("Agent Terminal").menu(&menu).show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    // The workspace window owns the shutdown: it confirms when tasks are running and stops the service.
                    "quit" => { show_main(app); let _ = app.emit_to("main", "tray-quit", ()); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event { show_main(tray.app_handle()); }
                });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;
            Ok(())
        })
        // Closing the workspace window keeps the app in the tray; the floating monitor stays available.
        .on_window_event(|window, event| {
            if window.label() != "main" { return; }
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => { api.prevent_close(); let _ = window.hide(); }
                tauri::WindowEvent::Destroyed => window.app_handle().exit(0),
                _ => {}
            }
        })
        .run(tauri::generate_context!()).expect("failed to run Agent Terminal");
}
