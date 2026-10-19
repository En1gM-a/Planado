package com.planado.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.appcompat.app.AppCompatDelegate
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** The theme the app saved with AsyncStorage (see context/ThemeContext.tsx). */
object ThemePreference {
  private const val KEY = "@planado/theme-mode"

  /** "system", "light" or "dark". */
  fun read(context: Context): String {
    val saved = runCatching {
      val file = context.getDatabasePath("RKStorage")
      if (!file.exists()) return@runCatching null
      SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
        db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(KEY))
          .use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
      }
    }.getOrNull()
    return if (saved == "light" || saved == "dark") saved else "system"
  }

  fun nightMode(context: Context): Int = when (read(context)) {
    "dark" -> AppCompatDelegate.MODE_NIGHT_YES
    "light" -> AppCompatDelegate.MODE_NIGHT_NO
    else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
  }
}

/**
 * Lets JavaScript read the saved theme synchronously at startup, before any
 * style is created, so the palette can be chosen once for the whole session.
 */
class PlanadoThemeModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "PlanadoTheme"

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getSavedThemeMode(): String = ThemePreference.read(reactApplicationContext)
}
