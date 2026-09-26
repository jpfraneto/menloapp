import Foundation
import Observation
import Security
import SwiftUI
import AppKit

@MainActor @Observable
public final class GitHubAccountModel {
    public private(set) var login: String?
    public private(set) var userCode: String?
    public private(set) var busy = false
    public private(set) var message: String?
    private let service = "com.menlo.github"
    private var cancelled = false

    public init() {}

    private func storedToken() -> String? {
        var value: CFTypeRef?
        let result = SecItemCopyMatching([
            kSecClass: kSecClassGenericPassword, kSecAttrService: service,
            kSecAttrAccount: "github", kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne,
        ] as CFDictionary, &value)
        guard result == errSecSuccess, let data = value as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func save(_ token: String) throws {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "github"]
        let data = Data(token.utf8)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updated == errSecItemNotFound {
            var item = query
            item[kSecValueData] = data
            item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw FactoryClientError.transport("GitHub signed in, but macOS could not save the session in Keychain.") }
        } else if updated != errSecSuccess { throw FactoryClientError.transport("macOS could not update the GitHub session in Keychain.") }
    }

    private func request(_ url: String, fields: [String: String]? = nil, token: String? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: url)!, timeoutInterval: 20)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("menlo-macos", forHTTPHeaderField: "User-Agent")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let fields {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: fields)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count < 1_048_576,
              let value = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { throw FactoryClientError.transport("GitHub sign-in is unavailable. Please try again.") }
        return value
    }

    private func identify(_ token: String) async throws {
        let user = try await request("https://api.github.com/user", token: token)
        guard let name = user["login"] as? String,
              name.range(of: #"^[A-Za-z0-9-]{1,39}$"#, options: .regularExpression) != nil,
              let id = user["id"] as? Int, id > 0
        else { throw FactoryClientError.invalidResponse("GitHub returned an invalid account.") }
        login = name
    }

    public func refresh() async {
        guard let token = storedToken() else { return }
        do { try await identify(token) } catch { message = "Your GitHub session needs attention. Sign in again." }
    }

    public func signIn() async {
        guard !busy else { return }
        busy = true; cancelled = false; message = nil
        defer { busy = false; userCode = nil }
        do {
            let status = try await request("https://menloapp.lol/api/menlo/v1/status")
            guard let clientID = status["github_client_id"] as? String, !clientID.isEmpty else {
                throw FactoryClientError.invalidConfiguration("Menlo’s GitHub sign-in is awaiting configuration. Terminal deployment can use an existing gh auth login session.")
            }
            let device = try await request("https://github.com/login/device/code", fields: ["client_id": clientID, "scope": "read:user public_repo"])
            guard let code = device["device_code"] as? String, let visible = device["user_code"] as? String,
                  device["verification_uri"] as? String == "https://github.com/login/device"
            else { throw FactoryClientError.transport("Enable Device Flow for the Menlo GitHub app, then try again.") }
            userCode = visible
            NSWorkspace.shared.open(URL(string: "https://github.com/login/device")!)
            var interval = max(device["interval"] as? Int ?? 5, 5)
            let deadline = Date().addingTimeInterval(TimeInterval(min(device["expires_in"] as? Int ?? 900, 900)))
            while Date() < deadline && !cancelled {
                try await Task.sleep(for: .seconds(interval))
                if cancelled { return }
                let response = try await request("https://github.com/login/oauth/access_token", fields: ["client_id": clientID, "device_code": code, "grant_type": "urn:ietf:params:oauth:grant-type:device_code"])
                if let token = response["access_token"] as? String {
                    try await identify(token)
                    try save(token)
                    message = "Signed in with GitHub. Your repositories and profile stay on GitHub."
                    return
                }
                let error = response["error"] as? String
                if error == "slow_down" { interval += 5 }
                else if error != "authorization_pending" { throw FactoryClientError.transport("GitHub sign-in was cancelled or expired. Try again.") }
            }
        } catch { message = error.localizedDescription }
    }

    public func signOut() {
        cancelled = true
        SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "github"] as CFDictionary)
        login = nil; message = "Signed out of Menlo’s GitHub session."
    }
    public func cancel() { cancelled = true }
}

struct GitHubAccountView: View {
    @State private var copied = false
    @Bindable var model: TohsenoAppModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Your GitHub. Your apps.").font(.largeTitle.bold())
                Text("Menlo uses GitHub for identity and source. Share an app from a repository you can push to, and send its link to a tester.")
                if let login = model.githubAccount.login {
                    Link("@\(login) ↗", destination: URL(string: "https://github.com/\(login)")!).font(.title2)
                    Button("Sign out") { model.githubAccount.signOut() }
                } else {
                    Button("Sign in with GitHub") { Task { await model.githubAccount.signIn() } }
                        .buttonStyle(PrimaryActionStyle()).disabled(model.githubAccount.busy)
                }
                if let code = model.githubAccount.userCode {
                    Text("Enter this code on GitHub").font(.headline)
                    Text(code).font(.system(.title, design: .monospaced)).textSelection(.enabled)
                    Button("Cancel") { model.githubAccount.cancel() }
                }
                if let message = model.githubAccount.message { Text(message).foregroundStyle(.secondary) }
                Divider()
                Text("Deploy from your app’s repository").font(.headline)
                Text("npm i -g menloapp\nmenloapp deploy").font(.system(.body, design: .monospaced)).textSelection(.enabled)
                Button(copied ? "Copied" : "Copy commands") {
                    NSPasteboard.general.clearContents()
                    copied = NSPasteboard.general.setString("npm i -g menloapp\nmenloapp deploy", forType: .string)
                }
                Text("Push code as usual. Your app link follows the default branch, and testers choose when to update.")
                Link("GitHub sign-in permissions", destination: URL(string: "https://github.com/settings/applications")!)
            }.frame(maxWidth: 680, alignment: .leading).padding(36)
        }.task { await model.githubAccount.refresh() }
    }
}

struct GitHubReviewSheet: View {
    @Bindable var model: TohsenoAppModel
    let review: GitHubReview
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            MenloWordmark().frame(width: 100)
            Text("Get \(review.app.name)").font(.title.weight(.semibold))
            Link(review.app.repository, destination: URL(string: "https://github.com/\(review.app.repository)")!)
            Text("Commit \(review.commit.prefix(7)) · \(review.app.scheme)").font(.system(.body, design: .monospaced))
            Text("Your Mac will download this source, build it with Xcode, and sign it for your intended iPhone using your Apple identity.")
            if let reasons = review.reasons {
                Text(reasons).foregroundStyle(.secondary).textSelection(.enabled)
            }
            Link("Review this source on GitHub ↗", destination: URL(string: "https://github.com/\(review.app.repository)/tree/\(review.commit)")!)
            if model.githubBusy { ProgressView("Preparing on your Mac. The first build can take several minutes.") }
            HStack {
                Button("Cancel") { model.dismissGitHubReview() }.disabled(model.githubBusy)
                Spacer()
                Button(review.reasons == nil ? "Build for my iPhone" : "I reviewed this code · build") {
                    Task { await model.installReviewedGitHubApp(approveMacReview: review.reasons != nil) }
                }.buttonStyle(PrimaryActionStyle()).disabled(model.githubBusy)
            }
        }.padding(32).frame(width: 580).background(TohsenoTheme.surface).foregroundStyle(TohsenoTheme.text).interactiveDismissDisabled(model.githubBusy)
    }
}
