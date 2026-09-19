// Compatibility entry point. The SVG is the single artwork source.
import Foundation
let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("app-icon.svg")
guard CommandLine.arguments.count == 2 else { fatalError("Usage: swift brand/menlo/render-icon.swift output.png") }
let task = Process()
task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
task.arguments = ["rsvg-convert", "--width", "1024", "--height", "1024", "--output", CommandLine.arguments[1], source.path]
try task.run()
task.waitUntilExit()
exit(task.terminationStatus)
