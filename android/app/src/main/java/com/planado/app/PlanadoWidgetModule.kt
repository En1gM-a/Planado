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
    snapshotDate: String,
    scheduleJson: String,
    promise: Promise
  ) {
    try {
      saveWidgetData(groupId, groupName, todayText, tomorrowText, snapshotDate, scheduleJson, "[]")
      promise.resolve(requestPinWidget())
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun saveGroupAndPinWidgetV2(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    snapshotDate: String,
    scheduleJson: String,
    importantJson: String,
    promise: Promise
  ) {
    try {
      saveWidgetData(groupId, groupName, todayText, tomorrowText, snapshotDate, scheduleJson, importantJson)
      promise.resolve(requestPinWidget())
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  /** V3 adds structured per-day events (times, colors, ids) and the group accent color. */
  @ReactMethod
  fun saveGroupAndPinWidgetV3(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    snapshotDate: String,
    scheduleJson: String,
    importantJson: String,
    eventsJson: String,
    accentColor: String,
    promise: Promise
  ) {
    try {
      saveWidgetData(
        groupId,
        groupName,
        todayText,
        tomorrowText,
        snapshotDate,
        scheduleJson,
        importantJson,
        eventsJson,
        accentColor,
      )
      promise.resolve(requestPinWidget())
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun saveGroupWidgetData(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    snapshotDate: String,
    scheduleJson: String,
    promise: Promise
  ) {
    try {
      saveWidgetData(groupId, groupName, todayText, tomorrowText, snapshotDate, scheduleJson, "[]")
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun saveGroupWidgetDataV2(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    snapshotDate: String,
    scheduleJson: String,
    importantJson: String,
    promise: Promise
  ) {
    try {
      saveWidgetData(groupId, groupName, todayText, tomorrowText, snapshotDate, scheduleJson, importantJson)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun saveGroupWidgetDataV3(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    snapshotDate: String,
    scheduleJson: String,
    importantJson: String,
    eventsJson: String,
    accentColor: String,
    promise: Promise
  ) {
    try {
      saveWidgetData(
        groupId,
        groupName,
        todayText,
        tomorrowText,
        snapshotDate,
        scheduleJson,
        importantJson,
        eventsJson,
        accentColor,
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  /** Redraws every Planado widget from its saved snapshot and reschedules its next refresh. */
  @ReactMethod
  fun refreshWidgets(promise: Promise) {
    try {
      PlanadoWidgetProvider.updateAllWidgets(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PLANADO_WIDGET_ERROR", error.message, error)
    }
  }

  private fun requestPinWidget(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val manager = AppWidgetManager.getInstance(reactContext)
    if (!manager.isRequestPinAppWidgetSupported) return false
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
    return manager.requestPinAppWidget(provider, null, callback)
  }

  /**
   * Older app bundles call V1/V2 without structured events; clearing them makes the
   * widget fall back to the plain-text lines instead of showing a stale snapshot.
   */
  private fun saveWidgetData(
    groupId: String,
    groupName: String,
    todayText: String,
    tomorrowText: String,
    snapshotDate: String,
    scheduleJson: String,
    importantJson: String,
    eventsJson: String? = null,
    accentColor: String? = null,
  ) {
    reactContext
      .getSharedPreferences(PlanadoWidgetProvider.PREFS_NAME, 0)
      .edit()
      .putString(PlanadoWidgetProvider.KEY_GROUP_ID, groupId)
      .putString(PlanadoWidgetProvider.KEY_GROUP_NAME, groupName)
      .putString(PlanadoWidgetProvider.KEY_TODAY, todayText)
      .putString(PlanadoWidgetProvider.KEY_TOMORROW, tomorrowText)
      .putString(PlanadoWidgetProvider.KEY_SNAPSHOT_DATE, snapshotDate)
      .putString(PlanadoWidgetProvider.KEY_SCHEDULE_JSON, scheduleJson)
      .putString(PlanadoWidgetProvider.KEY_IMPORTANT_JSON, importantJson)
      .putString(PlanadoWidgetProvider.KEY_EVENTS_JSON, eventsJson)
      .putString(PlanadoWidgetProvider.KEY_ACCENT_COLOR, accentColor?.takeIf { it.isNotBlank() })
      .apply()

    PlanadoWidgetProvider.updateAllWidgets(reactContext)
  }
}
