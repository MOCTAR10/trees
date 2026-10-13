import AVFoundation
import ExpoModulesCore

/// LiDAR distance at the frame centre (iPhone / iPad Pro, iOS 15.4+).
///
/// Starts a short AVCaptureSession on the LiDAR depth camera, takes the median
/// of the valid depth values (metres, Float32) in a central 9x9 window of one
/// depth frame, then stops. Not exercised in CI: validate on a LiDAR device.
public class DepthSensorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DepthSensor")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      if #available(iOS 15.4, *) {
        return AVCaptureDevice.default(.builtInLiDARDepthCamera, for: .video, position: .back) != nil
      }
      return false
    }

    AsyncFunction("measureCenterAsync") { (promise: Promise) in
      guard #available(iOS 15.4, *) else {
        promise.resolve(nil)
        return
      }
      let reader = LiDARCenterReader()
      reader.read { reading in
        promise.resolve(reading)
      }
    }
  }
}

@available(iOS 15.4, *)
final class LiDARCenterReader: NSObject, AVCaptureDepthDataOutputDelegate {
  private let session = AVCaptureSession()
  private let output = AVCaptureDepthDataOutput()
  private let queue = DispatchQueue(label: "ga.foresterie.depth")
  private var completion: (([String: Any]?) -> Void)?
  private var keepAlive: LiDARCenterReader?

  func read(_ done: @escaping ([String: Any]?) -> Void) {
    completion = done
    keepAlive = self
    guard
      let device = AVCaptureDevice.default(.builtInLiDARDepthCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    else {
      finish(nil)
      return
    }
    session.beginConfiguration()
    session.addInput(input)
    guard session.canAddOutput(output) else {
      session.commitConfiguration()
      finish(nil)
      return
    }
    session.addOutput(output)
    output.isFilteringEnabled = true
    output.setDelegate(self, callbackQueue: queue)
    session.commitConfiguration()
    queue.async { self.session.startRunning() }
    queue.asyncAfter(deadline: .now() + 3) { self.finish(nil) }  // timeout
  }

  func depthDataOutput(
    _ output: AVCaptureDepthDataOutput, didOutput depthData: AVDepthData,
    timestamp: CMTime, connection: AVCaptureConnection
  ) {
    let depth = depthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
    let map = depth.depthDataMap
    CVPixelBufferLockBaseAddress(map, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
    let width = CVPixelBufferGetWidth(map)
    let height = CVPixelBufferGetHeight(map)
    let rowBytes = CVPixelBufferGetBytesPerRow(map)
    guard let base = CVPixelBufferGetBaseAddress(map) else {
      finish(nil)
      return
    }
    var values: [Float] = []
    let half = 4
    for y in (height / 2 - half)...(height / 2 + half) {
      let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
      for x in (width / 2 - half)...(width / 2 + half) {
        let v = row[x]
        if v.isFinite && v > 0 { values.append(v) }
      }
    }
    guard !values.isEmpty else {
      finish(nil)
      return
    }
    values.sort()
    let median = values[values.count / 2]
    let total = Float((2 * half + 1) * (2 * half + 1))
    finish([
      "distanceM": Double(median),
      "confidence": Double(Float(values.count) / total),
      "source": "lidar",
    ])
  }

  private func finish(_ reading: [String: Any]?) {
    guard let done = completion else { return }
    completion = nil
    session.stopRunning()
    done(reading)
    keepAlive = nil
  }
}
