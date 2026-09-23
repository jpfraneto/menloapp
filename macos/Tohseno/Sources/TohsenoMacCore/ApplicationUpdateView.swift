import SwiftUI

struct ApplicationUpdateBanner: View {
    @Bindable var model: TohsenoAppModel
    private var updater: ApplicationUpdater { model.applicationUpdater }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(TohsenoTheme.amber)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.callout.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(TohsenoTheme.silver)
                if case let .downloading(received, total) = updater.phase {
                    if let total {
                        ProgressView(value: min(Double(received) / Double(total), 1))
                            .accessibilityLabel("Update download")
                    } else {
                        ProgressView().controlSize(.small).accessibilityLabel("Downloading update")
                    }
                } else if updater.phase == .verifying || updater.phase == .checking || updater.phase == .restarting || updater.phase == .cancelling {
                    ProgressView().controlSize(.small).accessibilityLabel(title)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            actions.controlSize(.small)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .tint(TohsenoTheme.amber)
        .background(TohsenoTheme.carbon)
        .overlay(alignment: .bottom) {
            Rectangle().fill(TohsenoTheme.amber.opacity(0.55)).frame(height: 1)
        }
        .accessibilityIdentifier("application.update-banner")
    }

    @ViewBuilder private var actions: some View {
        switch updater.phase {
        case .available:
            Button("Update") { updater.download() }
                .buttonStyle(PrimaryActionStyle())
        case .downloading, .verifying:
            Button("Cancel") { updater.cancelDownload() }
        case .ready:
            Button("Restart & update") { Task { await model.restartForApplicationUpdate() } }
                .buttonStyle(PrimaryActionStyle())
                .disabled(model.applicationUpdateRestartBlocker != nil)
        case .updated, .upToDate:
            Button("Done") { updater.dismissNotice() }
                .buttonStyle(PrimaryActionStyle())
        case .failed:
            Button("Try again") {
                if updater.update != nil { updater.download() }
                else { Task { await updater.check(userInitiated: true) } }
            }
            .buttonStyle(PrimaryActionStyle())
            Button { updater.dismissNotice() } label: { Image(systemName: "xmark") }
                .buttonStyle(.plain).accessibilityLabel("Dismiss update notice")
        default: EmptyView()
        }
    }

    private var title: String {
        switch updater.phase {
        case .idle, .upToDate: "Menlo is up to date"
        case .checking: "Checking for updates…"
        case .available: "Menlo \(updater.update?.version ?? "") is available"
        case .downloading: "Downloading your update…"
        case .verifying: "Preparing your update…"
        case .cancelling: "Cancelling the download…"
        case .ready: "Your update is ready"
        case .restarting: "Restarting Menlo…"
        case .updated: "Menlo is up to date"
        case .failed: "Update paused"
        }
    }

    private var detail: String {
        switch updater.phase {
        case .idle, .upToDate: "You have the latest version."
        case .checking: "This happens right here in Menlo."
        case .available:
            updater.update?.channel == "release-candidate"
                ? "Release candidate · Download now, restart when you’re ready."
                : "Download now, restart when you’re ready."
        case let .downloading(received, total):
            if let total {
                "\(bytes(received)) of \(bytes(total)) · You can keep working."
            } else {
                "\(bytes(received)) downloaded · You can keep working."
            }
        case .verifying: "Checking the download before installation."
        case .cancelling: "Your installed app stays as it is."
        case .ready: model.applicationUpdateRestartBlocker ?? "Your drafts will be here when Menlo reopens."
        case .restarting: "Saving your place and installing the update."
        case let .updated(version): "Updated to \(version). You’re ready to go."
        case let .failed(message): message
        }
    }

    private var symbol: String {
        switch updater.phase {
        case .updated, .upToDate, .ready: "checkmark.circle.fill"
        case .failed: "exclamationmark.circle"
        default: "arrow.down.circle.fill"
        }
    }

    private func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }
}
