package expo.modules.depthsensor

import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Session
import com.google.ar.core.exceptions.NotYetAvailableException
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteOrder
import kotlin.concurrent.thread

/**
 * ARCore Depth distance at the frame centre (supported Android devices).
 *
 * Opens a short ARCore session with an off-screen GL texture, waits for a
 * 16-bit depth image (millimetres), and returns the median of the valid
 * values in a central 9x9 window. Not exercised in CI: validate on a device
 * listed as "Depth API supported" by Google.
 */
class DepthSensorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DepthSensor")

    AsyncFunction("isAvailableAsync") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val availability = ArCoreApk.getInstance().checkAvailability(context)
      if (!availability.isSupported) return@AsyncFunction false
      try {
        val session = Session(context)
        val supported = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
        session.close()
        supported
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("measureCenterAsync") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      thread(name = "foresterie-depth") {
        promise.resolve(readCenter(context))
      }
    }
  }

  private fun readCenter(context: android.content.Context): Map<String, Any>? {
    val gl = OffscreenGl()
    var session: Session? = null
    try {
      gl.make()
      session = Session(context)
      val config = session.config.apply { depthMode = Config.DepthMode.AUTOMATIC }
      session.configure(config)
      session.setCameraTextureName(gl.texture)
      session.resume()
      val deadline = System.currentTimeMillis() + 4000
      while (System.currentTimeMillis() < deadline) {
        val frame = session.update()
        try {
          frame.acquireDepthImage16Bits().use { image ->
            val plane = image.planes[0]
            val buffer = plane.buffer.order(ByteOrder.nativeOrder()).asShortBuffer()
            val rowStride = plane.rowStride / 2
            val cx = image.width / 2
            val cy = image.height / 2
            val values = ArrayList<Int>()
            for (y in cy - 4..cy + 4) {
              for (x in cx - 4..cx + 4) {
                val mm = buffer.get(y * rowStride + x).toInt() and 0xFFFF
                if (mm > 0) values.add(mm)
              }
            }
            if (values.isNotEmpty()) {
              values.sort()
              return mapOf(
                "distanceM" to values[values.size / 2] / 1000.0,
                "confidence" to values.size / 81.0,
                "source" to "arcore",
              )
            }
          }
        } catch (e: NotYetAvailableException) {
          Thread.sleep(60)
        }
      }
      return null
    } catch (e: Exception) {
      return null
    } finally {
      session?.pause()
      session?.close()
      gl.release()
    }
  }
}

/** Minimal off-screen EGL context + external OES texture required by ARCore. */
private class OffscreenGl {
  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var context: EGLContext = EGL14.EGL_NO_CONTEXT
  private var surface: EGLSurface = EGL14.EGL_NO_SURFACE
  var texture: Int = 0
    private set

  fun make() {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    val version = IntArray(2)
    EGL14.eglInitialize(display, version, 0, version, 1)
    val attribs = intArrayOf(
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT,
      EGL14.EGL_NONE,
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val count = IntArray(1)
    EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, count, 0)
    context = EGL14.eglCreateContext(
      display, configs[0], EGL14.EGL_NO_CONTEXT,
      intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0,
    )
    surface = EGL14.eglCreatePbufferSurface(
      display, configs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0,
    )
    EGL14.eglMakeCurrent(display, surface, surface, context)
    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    texture = textures[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texture)
  }

  fun release() {
    if (display != EGL14.EGL_NO_DISPLAY) {
      EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      EGL14.eglDestroySurface(display, surface)
      EGL14.eglDestroyContext(display, context)
      EGL14.eglTerminate(display)
    }
  }
}
