import SwiftUI
import AppKit
import CoreImage.CIFilterBuiltins

public struct TohsenoSettingsView: View {
    @Bindable private var model: TohsenoAppModel
    @State private var selection = SettingsPage.general
    @State private var choosingExecutable = false
    @State private var isRefreshing = false
    @State private var isRestarting = false

    public init(model: TohsenoAppModel) { self.model = model }

    public var body: some View {
        HStack(spacing: 0) {
            navigation
            Divider().overlay(TohsenoTheme.separator)
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(selection.rawValue).font(.system(size: 26, weight: .semibold))
                            .accessibilityAddTraits(.isHeader)
                        Text(selection.detail)
                            .foregroundStyle(TohsenoTheme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let message = model.errorMessage {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundStyle(TohsenoTheme.error)
                            Text(message).fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button("Dismiss") { model.dismissError() }
                        }
                        .padding(16)
                        .background(TohsenoTheme.error.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                    }
                    switch selection {
                    case .general: general
                    case .iphone: iPhone
                    case .intelligence: intelligence
                    case .advanced: advanced
                    }
                }
                .frame(maxWidth: 640, alignment: .leading)
                .padding(28)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .scrollBounceBehavior(.basedOnSize)
            .id(selection)
            .accessibilityIdentifier("settings.content")
        }
        .frame(minWidth: 760, idealWidth: 800, maxWidth: .infinity,
               minHeight: 560, idealHeight: 620, maxHeight: .infinity)
        .background(TohsenoTheme.canvas)
        .foregroundStyle(TohsenoTheme.text)
        .tint(TohsenoTheme.accent)
        .disabled(model.applicationUpdater.phase == .restarting)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("settings.root")
        .fileImporter(isPresented: $choosingExecutable, allowedContentTypes: [.executable], allowsMultipleSelection: false) { result in
            do {
                guard let url = try result.get().first else { return }
                let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
                guard values.isRegularFile == true, values.isSymbolicLink != true,
                      FileManager.default.isExecutableFile(atPath: url.path) else {
                    throw FactoryClientError.invalidConfiguration("Choose a regular, non-symlink executable.")
                }
                model.customHarness.executable = url.path
            } catch {
                model.report(error)
            }
        }
    }

    private var navigation: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Settings")
                .font(.title3.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.top, 12)
                .padding(.bottom, 16)
            ForEach(SettingsPage.allCases) { page in
                Button { selection = page } label: {
                    HStack(spacing: 10) {
                        Image(systemName: page.symbol).frame(width: 20)
                        Text(page.rawValue).fontWeight(selection == page ? .semibold : .regular)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(SidebarActionStyle(isSelected: selection == page))
                .accessibilityAddTraits(selection == page ? .isSelected : [])
                .accessibilityIdentifier("settings.page.\(page.id)")
            }
            Spacer()
            MenloWordmark().frame(width: 76).padding(10)
        }
        .padding(12)
        .frame(width: 176)
        .background(TohsenoTheme.paper)
    }

    private var general: some View {
        VStack(spacing: 16) {
            SettingsCard {
                HStack(spacing: 16) {
                    TohsenoMark().frame(width: 46, height: 46)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Menlo").font(.title2.weight(.semibold))
                        Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")")
                            .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                    }
                }
                Text("Discover, build, and share iPhone apps.")
                    .foregroundStyle(TohsenoTheme.textMuted)
            }
            SettingsCard {
                SettingsRow("Updates", detail: "Choose when to download and restart.") {
                    Button("Check for Updates") {
                        Task { await model.applicationUpdater.check(userInitiated: true) }
                    }
                    .disabled(model.applicationUpdater.phase.isBusy)
                }
                if model.applicationUpdater.phase != .idle {
                    ApplicationUpdateBanner(model: model)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                } else if let message = model.applicationUpdater.checkMessage {
                    Text(message).font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                }
                Divider()
                SettingsRow("Privacy", detail: "How Menlo handles your apps and data.") {
                    Link(destination: URL(string: "https://menloapp.lol/privacy")!) {
                        Label("Read policy", systemImage: "arrow.up.right")
                    }
                }
            }
            if let login = model.githubAccount.login {
                SettingsCard {
                    HStack(spacing: 12) {
                        GitHubAvatar(login: login, userID: model.githubAccount.userID, size: 40)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("@\(login)").fontWeight(.semibold)
                            Text("GitHub account").font(.caption).foregroundStyle(TohsenoTheme.textMuted)
                        }
                        Spacer()
                        Link(destination: URL(string: "https://github.com/\(login)")!) {
                            HStack(spacing: 6) {
                                GitHubMark(size: 16)
                                Text("View profile")
                            }
                        }
                    }
                }
            }
        }
    }

    private var iPhone: some View {
        VStack(alignment: .leading, spacing: 20) {
            SettingsCard {
                SettingsRow(model.readiness?.deviceName ?? "Your iPhone",
                            detail: model.readiness?.headline ?? "Check the connection to your iPhone.") {
                    if model.readiness?.ready == true {
                        Label("Ready", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(TohsenoTheme.accent)
                    }
                }
                if let readiness = model.readiness {
                    Text(readiness.detail)
                        .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    if readiness.isWorking {
                        ProgressView(value: readiness.setupProgress)
                            .accessibilityLabel(readiness.setupStatus)
                    }
                    if !readiness.ready, let label = readiness.primaryLabel,
                       let action = readiness.primaryAction, action != "check" {
                        Button(label) { Task { await model.performReadinessAction() } }
                            .buttonStyle(PrimaryActionStyle())
                            .disabled(model.isSubmitting)
                    }
                }
                refreshButton("Check connection")
            }
            SettingsCard {
                Text("Private connection").font(.headline)
                Text("Connect Menlo on your iPhone to this Mac.")
                    .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                let devices = model.pairedCompanionDevices.filter { !$0.revoked }
                ForEach(devices) { device in
                    PairedCompanionDeviceRow(model: model, device: device)
                }
                if devices.isEmpty {
                    Text("No paired iPhone.").foregroundStyle(TohsenoTheme.textMuted)
                }
                Button("Pair iPhone…") { Task { await model.beginCompanionPairing() } }
                if let session = model.companionPairingSession {
                    CompanionPairingCard(session: session)
                }
                let revoked = model.pairedCompanionDevices.filter(\.revoked)
                if !revoked.isEmpty {
                    DisclosureGroup("Previous connections") {
                        VStack(spacing: 12) {
                            ForEach(revoked) { device in
                                PairedCompanionDeviceRow(model: model, device: device)
                            }
                        }.padding(.top, 12)
                    }
                }
            }
        }
    }

    private var intelligence: some View {
        VStack(alignment: .leading, spacing: 20) {
            SettingsCard {
                Text("On this Mac").font(.headline)
                let providers = (model.defaults?.harnesses ?? []).filter {
                    $0.id != "tohseno-managed" && $0.installed
                }
                ForEach(providers) { option in
                    SettingsRow(option.label,
                                detail: option.authentication == .authenticated ? nil : "Sign in through \(option.label), then refresh.") {
                        Label(option.authentication == .authenticated ? "Available" : "Needs sign-in",
                              systemImage: option.authentication == .authenticated ? "checkmark.circle.fill" : "circle")
                            .font(.callout)
                            .foregroundStyle(option.authentication == .authenticated
                                ? TohsenoTheme.accent : TohsenoTheme.textMuted)
                    }
                    .accessibilityIdentifier("intelligence.provider.\(option.id)")
                    Divider()
                }
                if providers.isEmpty {
                    Text("No supported local intelligence detected.")
                        .foregroundStyle(TohsenoTheme.textMuted)
                        .accessibilityIdentifier("intelligence.unavailable")
                }
                refreshButton("Refresh providers")
            }
            SettingsCard {
                SettingsRow("Menlo Intelligence") {
                    Text("Coming soon").font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                }
                .accessibilityIdentifier("intelligence.tohseno-coming-soon")
            }
            DisclosureGroup("Advanced", isExpanded: $model.advancedExpanded) {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Connect a custom tool or a local model server.")
                        .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                    SettingsCard {
                        DisclosureGroup("Custom executable") { customExecutable.padding(.top, 16) }
                    }
                    SettingsCard {
                        DisclosureGroup("Local model server") { localEndpoint.padding(.top, 16) }
                    }
                }.padding(.top, 16)
            }
        }
    }

    private var customExecutable: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsField("Identifier") { TextField("my-tool", text: $model.customHarness.id) }
            SettingsField("Display name") { TextField("My tool", text: $model.customHarness.label) }
            SettingsField("Executable") {
                HStack {
                    Text(model.customHarness.executable.isEmpty ? "Choose a local executable" : model.customHarness.executable)
                        .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                        .lineLimit(2).truncationMode(.middle)
                    Spacer()
                    Button("Choose…") { choosingExecutable = true }
                }
            }
            SettingsField("Models · separated by commas") { TextField("model-one, model-two", text: $model.customHarness.models) }
            SettingsField("Fixed arguments · one per line") {
                TextField("Arguments", text: $model.customHarness.arguments, axis: .vertical).lineLimit(2...4)
            }
            Toggle("Use by default", isOn: $model.customHarness.preferred)
            Button("Save custom tool") { Task { await model.saveCustomHarness() } }
                .disabled(model.isSubmitting)
        }
    }

    private var localEndpoint: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("An OpenAI-compatible server running on this Mac.")
                .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
            SettingsField("Identifier") { TextField("local-model", text: $model.localEndpoint.id) }
            SettingsField("Display name") { TextField("Local model", text: $model.localEndpoint.label) }
            SettingsField("Loopback base URL") { TextField("http://127.0.0.1:1234/v1", text: $model.localEndpoint.baseURL) }
            SettingsField("Models · separated by commas") { TextField("model-one, model-two", text: $model.localEndpoint.models) }
            SettingsField("Bearer credential · optional") { SecureField("Credential", text: $model.localEndpoint.credential) }
            Picker("Privacy mode", selection: $model.localEndpoint.privacyMode) {
                Text("Local").tag("local")
                Text("Standard").tag("standard")
                Text("Zero data retention").tag("zdr")
                Text("Private").tag("private")
            }
            Toggle("I consent to send app source to this endpoint", isOn: $model.localEndpoint.consentToSendSource)
            Toggle("Use by default", isOn: $model.localEndpoint.preferred)
            Button("Check and save server") { Task { await model.saveLocalEndpoint() } }
                .disabled(model.isSubmitting || !model.localEndpoint.consentToSendSource)
        }
    }

    private var advanced: some View {
        VStack(alignment: .leading, spacing: 20) {
            SettingsCard {
                SettingsRow("Terminal command", detail: model.cliIntegration?.enabled == true
                            ? "Ready in new Terminal windows." : "Use Menlo from your terminal.") {
                    if model.cliIntegration?.enabled == true {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(TohsenoTheme.accent)
                            .accessibilityLabel("Terminal command activated")
                    } else {
                        Button(model.isEnablingCLI ? "Activating…" : "Activate") {
                            Task { await model.enableCLIIntegration() }
                        }
                        .disabled(model.isEnablingCLI || model.cliIntegration?.installed != true)
                    }
                }
                if let message = model.cliMessage {
                    Text(message).font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                }
            }
            SettingsCard {
                SettingsRow("Support report", detail: "Save diagnostic information to share when something goes wrong.") {
                    Button("Export…") { model.exportSupportReport() }
                }
                Divider()
                SettingsRow("Local service", detail: "Restart the connection between Menlo and its background service.") {
                    Button(isRestarting ? "Restarting…" : "Restart") {
                        isRestarting = true
                        Task {
                            await model.restartService()
                            isRestarting = false
                        }
                    }
                    .disabled(isRestarting || model.isSubmitting)
                }
            }
            SettingsCard {
                DisclosureGroup("Retired apps (\(model.archivedApps.count))") {
                    VStack(alignment: .leading, spacing: 16) {
                        if model.archivedApps.isEmpty {
                            Text("No retired apps.").foregroundStyle(TohsenoTheme.textMuted)
                        }
                        ForEach(model.archivedApps) { app in
                            SettingsRow(app.displayName, detail: "Source and history are still on this Mac.") {
                                Button("Restore") { Task { await model.restore(app) } }
                                    .disabled(model.isSubmitting)
                                    .accessibilityIdentifier("archive.restore.\(app.id)")
                            }
                        }
                    }.padding(.top, 16)
                }
            }
            DisclosureGroup("Additional diagnostics") {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Open the legacy browser interface for support and recovery.")
                        .font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                    Button("Open Browser Diagnostics") { Task { await model.openLegacyStudio() } }
                    refreshButton("Refresh connection status")
                }.padding(.top, 16)
            }
        }
    }

    private func refreshButton(_ title: String) -> some View {
        Button {
            isRefreshing = true
            Task {
                await model.reload()
                isRefreshing = false
            }
        } label: {
            HStack(spacing: 6) {
                if isRefreshing { ProgressView().controlSize(.mini) }
                Text(isRefreshing ? "Checking…" : title)
            }
        }
        .disabled(isRefreshing || model.isSubmitting)
    }
}

private enum SettingsPage: String, CaseIterable, Identifiable {
    case general = "General"
    case iphone = "iPhone"
    case intelligence = "Intelligence"
    case advanced = "Advanced"

    var id: String { rawValue.lowercased() }
    var symbol: String {
        switch self {
        case .general: "gearshape"
        case .iphone: "iphone"
        case .intelligence: "sparkles"
        case .advanced: "slider.horizontal.3"
        }
    }
    var detail: String {
        switch self {
        case .general: "Menlo on your Mac."
        case .iphone: "Your iPhone and its connection to this Mac."
        case .intelligence: "Use the tools you already have. Sign-in stays with your provider."
        case .advanced: "Terminal access, recovery, and troubleshooting."
        }
    }
}

private struct SettingsCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(TohsenoTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(TohsenoTheme.separator.opacity(0.65)))
    }
}

private struct SettingsRow<Accessory: View>: View {
    let title: String
    var detail: String?
    @ViewBuilder let accessory: Accessory

    init(_ title: String, detail: String? = nil, @ViewBuilder accessory: () -> Accessory) {
        self.title = title
        self.detail = detail
        self.accessory = accessory()
    }

    var body: some View {
        HStack(spacing: 20) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).fontWeight(.medium)
                if let detail {
                    Text(detail).font(.callout).foregroundStyle(TohsenoTheme.textMuted)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            accessory.fixedSize()
        }
    }
}

private struct SettingsField<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.callout.weight(.medium))
            content.textFieldStyle(.roundedBorder).accessibilityLabel(title)
        }
    }
}

private struct PairedCompanionDeviceRow: View {
    let model: TohsenoAppModel
    let device: PairedCompanionDevice
    @State private var name: String
    @State private var isRenaming = false
    @State private var isSaving = false
    @State private var confirmingRevoke = false

    init(model: TohsenoAppModel, device: PairedCompanionDevice) {
        self.model = model
        self.device = device
        _name = State(initialValue: device.displayName)
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: device.revoked ? "iphone.slash" : "iphone.gen3")
                .font(.title2).foregroundStyle(TohsenoTheme.textMuted).frame(width: 28)
            if isRenaming {
                TextField("iPhone name", text: $name).textFieldStyle(.roundedBorder)
                Button("Save") {
                    isSaving = true
                    Task {
                        await model.renameCompanionDevice(device, to: name)
                        isSaving = false
                        if model.pairedCompanionDevices.first(where: { $0.id == device.id })?.displayName == name {
                            isRenaming = false
                        }
                    }
                }
                .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("Cancel") { isRenaming = false; name = device.displayName }
                    .disabled(isSaving)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text(device.displayName).fontWeight(.medium)
                    Text(device.revoked ? "Pairing revoked" : "Paired with this Mac")
                        .font(.caption).foregroundStyle(TohsenoTheme.textMuted)
                }
                Spacer()
                if !device.revoked {
                    Menu {
                        Button("Rename…") { name = device.displayName; isRenaming = true }
                        Button("Revoke pairing…", role: .destructive) { confirmingRevoke = true }
                    } label: {
                        Image(systemName: "ellipsis").frame(width: 24, height: 24)
                    }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                    .accessibilityLabel("Manage \(device.displayName)")
                }
            }
        }
        .accessibilityIdentifier("settings.companion.\(device.id)")
        .confirmationDialog("Revoke pairing with \(device.displayName)?", isPresented: $confirmingRevoke, titleVisibility: .visible) {
            Button("Revoke pairing", role: .destructive) { Task { await model.revokeCompanionDevice(device) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This iPhone will lose its private connection to this Mac. Pair it again to reconnect.")
        }
    }
}

struct CompanionPairingCard: View {
    let session: CompanionPairingSession

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if session.state == "waiting", let image = pairingQRCode(session.pairingURI) {
                HStack(alignment: .top, spacing: 16) {
                    Image(nsImage: image)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 150, height: 150)
                        .accessibilityLabel("Companion pairing QR code")
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Open Menlo Companion and scan this code.")
                        Text("This one-use invitation expires at \(session.expiresAt).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Copy Pairing Link") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(session.pairingURI, forType: .string)
                        }
                    }
                }
            } else if session.state == "paired" {
                Label("\(session.deviceName ?? "iPhone") exchanged an authenticated snapshot with this Mac.", systemImage: "checkmark.shield.fill")
            } else {
                Text("Pairing \(session.state). Create a new one-use invitation to retry.")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}

private func pairingQRCode(_ value: String) -> NSImage? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(value.utf8)
    filter.correctionLevel = "M"
    guard let output = filter.outputImage?.transformed(
        by: CGAffineTransform(scaleX: 8, y: 8)
    ) else { return nil }
    let representation = NSCIImageRep(ciImage: output)
    let image = NSImage(size: representation.size)
    image.addRepresentation(representation)
    return image
}
