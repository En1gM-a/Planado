package com.planado.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import org.json.JSONObject

class PlanadoWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { widgetId ->
      manager.updateAppWidget(widgetId, buildViews(context, widgetId))
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_WIDGET_PINNED) updateAllWidgets(context)
  }

  companion object {
    const val PREFS_NAME = "planado_widget"
    const val KEY_GROUP_ID = "selected_group_id"
    const val KEY_GROUP_NAME = "selected_group_name"
    const val KEY_TODAY = "today_events"
    const val KEY_TOMORROW = "tomorrow_events"
    const val KEY_SNAPSHOT_DATE = "snapshot_date"
    const val KEY_SCHEDULE_JSON = "schedule_json"
    const val ACTION_WIDGET_PINNED = "com.planado.app.WIDGET_PINNED"

    fun updateAllWidgets(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val provider = ComponentName(context, PlanadoWidgetProvider::class.java)
      val widgetIds = manager.getAppWidgetIds(provider)
      widgetIds.forEach { widgetId ->
        manager.updateAppWidget(widgetId, buildViews(context, widgetId))
      }
    }

    private fun buildViews(context: Context, widgetId: Int): RemoteViews {
      val preferences = context.getSharedPreferences(PREFS_NAME, 0)
      val groupId = preferences.getString(KEY_GROUP_ID, "").orEmpty()
      val groupName = preferences.getString(KEY_GROUP_NAME, "Choose a Planado group").orEmpty()
      val savedToday = preferences.getString(KEY_TODAY, "Open Planado and choose Make widget").orEmpty()
      val savedTomorrow = preferences.getString(KEY_TOMORROW, "").orEmpty()
      val snapshotDate = preferences.getString(KEY_SNAPSHOT_DATE, "").orEmpty()
      val scheduleJson = preferences.getString(KEY_SCHEDULE_JSON, "{}").orEmpty()

      val todayDate = Calendar.getInstance()
      val tomorrowDate = (todayDate.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) }
      val yesterdayDate = (todayDate.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
      val keyFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val labelFormatter = SimpleDateFormat("MMM d", Locale.getDefault())
      val todayKey = keyFormatter.format(todayDate.time)
      val yesterdayKey = keyFormatter.format(yesterdayDate.time)

      val datedSchedule = try { JSONObject(scheduleJson) } catch (_: Exception) { JSONObject() }
      val cachedToday = if (datedSchedule.has(todayKey)) datedSchedule.optString(todayKey) else null
      val tomorrowKey = keyFormatter.format(tomorrowDate.time)
      val cachedTomorrow = if (datedSchedule.has(tomorrowKey)) datedSchedule.optString(tomorrowKey) else null
      val (legacyToday, legacyTomorrow) = when (snapshotDate) {
        todayKey -> savedToday to savedTomorrow
        yesterdayKey -> savedTomorrow to "Open Planado to refresh tomorrow"
        else -> "Open Planado to refresh today's schedule" to ""
      }
      val today = cachedToday ?: legacyToday
      val tomorrow = cachedTomorrow ?: legacyTomorrow
      val todayLabel = "TODAY · ${labelFormatter.format(todayDate.time).uppercase(Locale.getDefault())}"
      val tomorrowLabel = "TOMORROW · ${labelFormatter.format(tomorrowDate.time).uppercase(Locale.getDefault())}"

      return RemoteViews(context.packageName, R.layout.planado_widget).apply {
        setTextViewText(R.id.widget_group_name, groupName)
        setTextViewText(R.id.widget_today_label, todayLabel)
        setTextViewText(R.id.widget_today_events, today)
        setTextViewText(R.id.widget_tomorrow_label, tomorrowLabel)
        setTextViewText(R.id.widget_tomorrow_events, tomorrow)
        setViewVisibility(R.id.widget_tomorrow_section, if (tomorrow.isBlank()) View.GONE else View.VISIBLE)

        val target = if (groupId.isBlank()) "planado://groups" else "planado://group/$groupId"
        val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(target), context, MainActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
          context,
          widgetId,
          openIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        setOnClickPendingIntent(R.id.widget_root, pendingIntent)
      }
    }
  }
}
