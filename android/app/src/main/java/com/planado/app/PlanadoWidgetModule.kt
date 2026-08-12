package com.planado.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PlanadoWidgetModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "PlanadoWidget"

  @ReactMethod
  fun saveGroupAndPinWidget(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    promise: Promise
  ) {
    try {
      reactContext
        .getSharedPreferences(PlanadoWidgetProvider.PREFS_NAME, 0)
        .edit()
        .putString(PlanadoWidgetProvider.KEY_GROUP_ID, groupId)
        .putString(PlanadoWidgetProvider.KEY_GROUP_NAME, groupName)
        .putString(PlanadoWidgetProvider.KEY_TODAY, todayText)
        .putString(PlanadoWidgetProvider.KEY_TOMORROW, tomorrowText)
        .apply()

      PlanadoWidgetProvider.updateAllWidgets(reactContext)

      var pinRequested = false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val manager = AppWidgetManager.getInstance(reactContext)
        if (manager.isRequestPinAppWidgetSupported) {
          val provider = ComponentName(reactContext, PlanadoWidgetProvider::class.java)
          val callbackIntent = Intent(reactContext, PlanadoWidgetProvider::class.java).apply {
            action = PlanadoWidgetProvider.ACTION_WIDGET_PINNED
          }
          val callback = PendingIntent.getBroadcast(
            reactContext,
            0,
            callbackIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
          )
          pinRequested = manager.requestPinAppWidget(provider, null, callback)
        }
      }

      promise.resolve(pinRequested)
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }
}
