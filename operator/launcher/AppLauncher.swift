import AppKit
import SwiftUI

struct Configuration: Decodable {
    let node: String
    let url: String
    let data: String
    let log: String
    let guide: String
    let backups: String
}
struct AppStatus: Decodable {
    let state: String
    let managed: Bool
    let message: String
}

@MainActor final class LauncherModel: ObservableObject {
    @Published var status = AppStatus(state: "checking", managed: false, message: "Checking…")
    @Published var busy = false
    @Published var error: String?
    let config: Configuration?
    private var checking = false
    private var timer: Timer?

    init() {
        if let resource = Bundle.main.url(forResource: "config", withExtension: "json"),
           let data = try? Data(contentsOf: resource) {
            config = try? JSONDecoder().decode(Configuration.self, from: data)
        } else { config = nil }
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func execute(_ action: String, completion: @escaping (AppStatus) -> Void) {
        guard let config, let helper = Bundle.main.url(forResource: "control", withExtension: "mjs") else {
            completion(AppStatus(state: "error", managed: false, message: "Setup is missing. Run the launcher installer again."))
            return
        }
        DispatchQueue.global(qos: .utility).async {
            let process = Process()
            let output = Pipe()
            process.executableURL = URL(fileURLWithPath: config.node)
            process.arguments = [helper.path, action]
            process.standardOutput = output
            process.standardError = FileHandle.nullDevice
            var result = AppStatus(state: "error", managed: false, message: "Could not reach the launcher. Check that Node is installed.")
            do {
                try process.run()
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                if let decoded = try? JSONDecoder().decode(AppStatus.self, from: data) { result = decoded }
            } catch { /* Present the short actionable default, not process internals. */ }
            let finalResult = result
            DispatchQueue.main.async { completion(finalResult) }
        }
    }

    func refresh() {
        guard !busy && !checking else { return }
        checking = true
        execute("status") { [weak self] result in
            if self?.busy == false { self?.status = result }
            self?.checking = false
        }
    }
    func perform(_ action: String, openAfter: Bool = false) {
        guard !busy else { return }
        busy = true
        error = nil
        execute(action) { [weak self] result in
            guard let self else { return }
            self.busy = false
            if result.state == "error" { self.error = result.message }
            else { self.status = result }
            if openAfter && result.state == "running", let config = self.config, let url = URL(string: config.url) {
                NSWorkspace.shared.open(url)
            }
            self.refresh()
        }
    }
    func openFile(_ path: String?) {
        if let path { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
    }
}

struct ControlButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    var prominent = false
    func makeBody(configuration: Self.Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 9).fill(
                configuration.isPressed ? Color.white.opacity(0.18) :
                    prominent ? Color.mint.opacity(0.27) : Color.white.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.white.opacity(0.14)))
            .contentShape(RoundedRectangle(cornerRadius: 9))
            .opacity(enabled ? 1 : 0.4)
    }
}

struct LauncherView: View {
    @ObservedObject var model: LauncherModel
    let hide: () -> Void
    let resize: (CGFloat) -> Void
    @State private var details = false
    private var panelHeight: CGFloat { (details ? 450 : 350) + (model.error == nil ? 0 : 80) }
    private var running: Bool { model.status.state == "running" }
    private var tint: Color { running ? .mint : model.status.state == "blocked" || model.error != nil ? .orange : .gray }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "switch.2").font(.system(size: 22, weight: .semibold)).foregroundStyle(.mint)
                Text("App launcher").font(.system(size: 17, weight: .semibold))
                Spacer()
                Button(action: hide) { Image(systemName: "minus").frame(width: 30, height: 30) }
                    .buttonStyle(.plain).help("Hide launcher").accessibilityLabel("Hide launcher")
            }
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("PROspector").font(.system(size: 21, weight: .semibold))
                        Text(model.busy ? "Working…" : model.status.message)
                            .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 10)
                    Circle().fill(tint).frame(width: 8, height: 8).accessibilityHidden(true)
                }
                Button { model.perform("start", openAfter: true) } label: {
                    Label(running ? "Open PROspector" : "Start PROspector", systemImage: running ? "arrow.up.right.square" : "play.fill")
                }
                .buttonStyle(ControlButton(prominent: true)).disabled(model.busy)
                HStack(spacing: 10) {
                    Button { model.perform("stop") } label: { Label("Stop", systemImage: "stop.fill") }
                    Button { model.perform("restart", openAfter: true) } label: { Label("Restart", systemImage: "arrow.clockwise") }
                }
                .buttonStyle(ControlButton()).disabled(model.busy || !model.status.managed)
                if let error = model.error {
                    Text(error).font(.system(size: 12)).foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true).accessibilityLabel("Error: \(error)")
                }
            }
            .padding(16).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.11)))

            DisclosureGroup("Details", isExpanded: $details) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Frontend and backend run together on this Mac.").foregroundStyle(.secondary)
                    HStack(spacing: 16) {
                        Button("Open log") { model.openFile(model.config?.log) }
                        Button("Backups") { model.openFile(model.config?.backups) }
                        Button("Help") { model.openFile(model.config?.guide) }
                    }.buttonStyle(.link)
                    Text("The launcher opens at login. PROspector starts when you click Start.").foregroundStyle(.secondary)
                }.font(.system(size: 12)).padding(.top, 10)
            }.font(.system(size: 12)).tint(.mint)
            HStack {
                Text("Local app").font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                Button("Quit launcher") { NSApp.terminate(nil) }
                    .buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(.secondary)
                    .help("PROspector keeps running until you click Stop")
                    .disabled(model.busy)
            }
        }
        .padding(20).frame(width: 390, height: panelHeight)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .overlay(LinearGradient(colors: [.mint.opacity(0.08), .clear, .blue.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing)
            .clipShape(RoundedRectangle(cornerRadius: 18)).allowsHitTesting(false))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.18)))
        .environment(\.colorScheme, .dark)
        .onAppear { resize(panelHeight) }
        .onChange(of: details) { _, _ in resize(panelHeight) }
        .onChange(of: model.error) { _, _ in resize(panelHeight) }
    }
}

final class LauncherPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func cancelOperation(_ sender: Any?) { orderOut(nil) }
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var item: NSStatusItem!
    private var panel: LauncherPanel!
    private let model = LauncherModel()
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Opening the installed app repeatedly must not add duplicate menu icons.
        let others = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "")
        if others.contains(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            NSApp.terminate(nil); return
        }
        NSApp.setActivationPolicy(.accessory)
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.image = NSImage(systemSymbolName: "switch.2", accessibilityDescription: "App launcher")
            button.image?.isTemplate = true
            button.toolTip = "App launcher — PROspector"
            button.target = self; button.action = #selector(toggle)
        }
        panel = LauncherPanel(contentRect: NSRect(x: 0, y: 0, width: 390, height: 330), styleMask: [.borderless], backing: .buffered, defer: false)
        panel.title = "App launcher"
        panel.appearance = NSAppearance(named: .darkAqua)
        panel.isOpaque = false; panel.backgroundColor = .clear; panel.hasShadow = true
        panel.level = .floating; panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true; panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let view = NSHostingView(rootView: LauncherView(model: model, hide: { [weak self] in self?.panel.orderOut(nil) }, resize: { [weak self] height in
            DispatchQueue.main.async { self?.resize(height) }
        }))
        view.sizingOptions = []
        panel.contentView = view
        toggle()
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { toggle() }; return true
    }
    private func resize(_ height: CGFloat) {
        guard let panel, height > 0 else { return }
        let top = panel.frame.maxY
        panel.setFrame(NSRect(x: panel.frame.minX, y: top - height, width: 390, height: height), display: true)
    }
    @objc func toggle() {
        if panel.isVisible { panel.orderOut(nil); return }
        model.refresh()
        if let screen = NSScreen.main {
            let size = NSSize(width: 390, height: max(330, panel.frame.height))
            panel.setContentSize(size)
            panel.setFrameOrigin(NSPoint(x: screen.visibleFrame.maxX - size.width - 12, y: screen.visibleFrame.maxY - size.height - 12))
        }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@main struct AppLauncher {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
