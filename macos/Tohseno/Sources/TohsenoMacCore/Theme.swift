import AppKit
import CoreText
import SwiftUI

/// Shared Menlo roles; web equivalents live in public/menlo/tokens.css.
public enum TohsenoTheme {
    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let value = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
                           green: CGFloat((value >> 8) & 255) / 255,
                           blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }

    public static let canvas = adaptive(0xFAF9F6, 0x19211C)
    public static let paper = adaptive(0xF3EDDD, 0x252D24)
    public static let surface = adaptive(0xFFFEFA, 0x222B24)
    public static let text = adaptive(0x202720, 0xF2F0E6)
    public static let textMuted = adaptive(0x62695E, 0xB3BBAA)
    public static let accent = adaptive(0x315F40, 0xA6CBA5)
    public static let onAccent = adaptive(0xFFFFFF, 0x19291D)
    public static let accentSoft = adaptive(0xE8EDDE, 0x303E2E)
    public static let separator = adaptive(0xDCDED3, 0x455042)
    public static let controlBorder = adaptive(0x858D7E, 0x86947D)
    public static let warning = adaptive(0x805A13, 0xE6C27A)
    public static let error = adaptive(0xA3302D, 0xFFB4A9)

    // Retained names keep the workshop's existing projections on one palette.
    public static let void = canvas
    public static let carbon = surface
    public static let graphite = accentSoft
    public static let iron = separator
    public static let ash = textMuted
    public static let silver = textMuted
    public static let bone = text
    public static let amber = accent
    public static let ember = accentSoft
}

public enum MenloTypography {
    private static let registered: Bool = {
        guard let url = MenloBrand.bundle.url(forResource: "MenloApp-Bold", withExtension: "ttf") else { return false }
        return CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }()

    public static func brand(size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        _ = registered
        return .custom("MenloApp-Bold", size: size, relativeTo: style)
    }
}

public struct MenloWordmark: View {
    @Environment(\.colorScheme) private var colorScheme
    public init() {}

    public var body: some View {
        if let image = MenloBrand.image("wordmark", dark: colorScheme == .dark) {
            Image(nsImage: image).resizable()
                .aspectRatio(3140.0 / 860.0, contentMode: .fit)
                .accessibilityLabel("Menlo")
        }
    }
}

public struct TohsenoMark: View {
    @Environment(\.colorScheme) private var colorScheme

    public init(stroke: Color = TohsenoTheme.accent, gap: Color = TohsenoTheme.canvas) {}

    public var body: some View {
        if let image = MenloBrand.image("mark", dark: colorScheme == .dark) {
            Image(nsImage: image).resizable()
                .aspectRatio(940.0 / 860.0, contentMode: .fit)
                .accessibilityHidden(true)
        }
    }
}

public enum MenloBrand {
    // SwiftPM's generated lookup is next to the executable during development.
    // Signed .app bundles keep their resource bundle in Contents/Resources.
    static let bundle: Bundle = {
        if let url = Bundle.main.resourceURL?.appendingPathComponent("TohsenoMac_TohsenoMacCore.bundle"),
           let packaged = Bundle(url: url) { return packaged }
        return .module
    }()

    public static func image(_ name: String, dark: Bool = false) -> NSImage? {
        guard let url = bundle.url(forResource: "menlo-\(name)-\(dark ? "dark" : "light")", withExtension: "pdf") else { return nil }
        return NSImage(contentsOf: url)
    }
}

public struct TohsenoSpinner: View {
    private let size: CGFloat

    public init(size: CGFloat = 28, stroke: Color = TohsenoTheme.accent, gap: Color = TohsenoTheme.canvas) {
        self.size = size
    }

    public var body: some View {
        ProgressView().controlSize(.small)
            .frame(width: size, height: size)
            .accessibilityLabel("Working")
    }
}

/// Identity stays still; actual work uses the system progress indicator.
public struct TohsenoLivingMark: View {
    private let size: CGFloat

    public init(size: CGFloat = 96, animated: Bool = true) { self.size = size }

    public var body: some View {
        TohsenoMark().frame(width: size, height: size)
            .frame(width: size * 1.4, height: size * 1.4)
            .accessibilityHidden(true)
    }
}

struct PrimaryActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.semibold)
            .foregroundStyle(TohsenoTheme.onAccent)
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
            .background(TohsenoTheme.accent.opacity(configuration.isPressed ? 0.78 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .opacity(isEnabled ? 1 : 0.5)
    }
}
