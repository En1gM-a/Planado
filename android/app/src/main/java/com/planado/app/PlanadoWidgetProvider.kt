package com.planado.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.roundToInt
import org.json.JSONArray
import org.json.JSONObject

/** One row in the widget's day list. Times are pre-formatted by the app in the user's locale. */
private data class WidgetEvent(
  val id: String?,
  val time: String,
  val title: String,
  val detail: String,
  val color: Int?,
  val allDay: Boolean,
  val startMs: Long,
  val endMs: Long,
)

private data class DaySchedule(
  val events: List<WidgetEvent>,
  val emptyMessage: String,
  /** True when the cached snapshot no longer covers this day. */
  val stale: Boolean,
)

private data class ImportantEvent(val title: String, val countdown: String, val description: String)

class PlanadoWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { widgetId ->
      manager.updateAppWidget(widgetId, buildViews(context, manager, widgetId))
    }
    scheduleNextRefresh(context)
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    cancelRefresh(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    manager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, manager, appWidgetId, newOptions)
    // Resizing changes how many rows fit, so re-render for the new size.
    manager.updateAppWidget(appWidgetId, buildViews(context, manager, appWidgetId))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      // After an app update the launcher shows the bare initial layout until the
      // provider pushes views, so re-render from the cached snapshot right away.
      ACTION_WIDGET_PINNED,
      ACTION_REFRESH,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> updateAllWidgets(context)
    }
  }

  companion object {
    const val PREFS_NAME = "planado_widget"
    const val KEY_GROUP_ID = "selected_group_id"
    const val KEY_GROUP_NAME = "selected_group_name"
    const val KEY_TODAY = "today_events"
    const val KEY_TOMORROW = "tomorrow_events"
    const val KEY_SNAPSHOT_DATE = "snapshot_date"
    const val KEY_SCHEDULE_JSON = "schedule_json"
    const val KEY_IMPORTANT_JSON = "important_json"
    const val KEY_EVENTS_JSON = "events_json"
    const val KEY_ACCENT_COLOR = "accent_color"
    const val ACTION_WIDGET_PINNED = "com.planado.app.WIDGET_PINNED"
    const val ACTION_REFRESH = "com.planado.app.WIDGET_REFRESH"

    // Refresh timing: just after a plan ends or the day turns over, never in a tight loop.
    private const val END_GRACE_MS = 1_000L
    private const val MIDNIGHT_GRACE_MS = 5_000L
    private const val MIN_REFRESH_DELAY_MS = 30_000L
    private const val INEXACT_WINDOW_MS = 10 * 60_000L

    // Approximate heights (dp) used to decide how many rows fit the widget.
    private const val CHROME_HEIGHT_DP = 82
    private const val IMPORTANT_ROW_HEIGHT_DP = 36
    private const val SECTION_LABEL_HEIGHT_DP = 26
    private const val EVENT_ROW_HEIGHT_DP = 38
    private const val EMPTY_ROW_HEIGHT_DP = 24
    private const val MORE_LINE_HEIGHT_DP = 18
    private const val DEFAULT_HEIGHT_DP = 200

    fun updateAllWidgets(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val provider = ComponentName(context, PlanadoWidgetProvider::class.java)
      val widgetIds = manager.getAppWidgetIds(provider)
      widgetIds.forEach { widgetId ->
        manager.updateAppWidget(widgetId, buildViews(context, manager, widgetId))
      }
      scheduleNextRefresh(context)
    }

    /**
     * Wakes the widget for the next moment its content changes: a plan starting
     * or ending, or midnight, when "today" moves on. The periodic update in
     * planado_widget_info.xml is inexact and can be held back for hours, so it
     * only stays as a fallback. The alarm does not wake the phone: if it is
     * asleep, the widget redraws the moment it wakes, when it can be seen.
     */
    fun scheduleNextRefresh(context: Context) {
      val alarms = context.getSystemService(AlarmManager::class.java) ?: return
      val pending = refreshIntent(context)
      val provider = ComponentName(context, PlanadoWidgetProvider::class.java)
      if (AppWidgetManager.getInstance(context).getAppWidgetIds(provider).isEmpty()) {
        alarms.cancel(pending)
        return
      }

      val triggerAt = nextRefreshAt(context, System.currentTimeMillis())
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
          alarms.setExact(AlarmManager.RTC, triggerAt, pending)
        } else {
          alarms.setWindow(AlarmManager.RTC, triggerAt, INEXACT_WINDOW_MS, pending)
        }
      } catch (_: SecurityException) {
        alarms.setWindow(AlarmManager.RTC, triggerAt, INEXACT_WINDOW_MS, pending)
      }
    }

    fun cancelRefresh(context: Context) {
      context.getSystemService(AlarmManager::class.java)?.cancel(refreshIntent(context))
    }

    private fun refreshIntent(context: Context): PendingIntent {
      val intent = Intent(context, PlanadoWidgetProvider::class.java).setAction(ACTION_REFRESH)
      return PendingIntent.getBroadcast(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    /** The soonest of: a start or end among today's plans and countdowns, or midnight. */
    private fun nextRefreshAt(context: Context, now: Long): Long {
      val preferences = context.getSharedPreferences(PREFS_NAME, 0)
      val todayKey = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now)
      var next = nextMidnight(now) + MIDNIGHT_GRACE_MS
      fun consider(time: Long) {
        if (time > now && time < next) next = time
      }

      structuredEvents(parseObject(preferences.getString(KEY_EVENTS_JSON, null)), todayKey)?.forEach { event ->
        consider(event.startMs)
        if (event.endMs > 0L) consider(event.endMs + END_GRACE_MS)
      }
      val important = try {
        JSONArray(preferences.getString(KEY_IMPORTANT_JSON, "[]"))
      } catch (_: Exception) {
        JSONArray()
      }
      for (index in 0 until important.length()) {
        val item = important.optJSONObject(index) ?: continue
        consider(item.optLong("startMs", 0L))
        val endMs = item.optLong("endMs", 0L)
        if (endMs > 0L) consider(endMs + END_GRACE_MS)
      }
      return max(next, now + MIN_REFRESH_DELAY_MS)
    }

    private fun nextMidnight(now: Long): Long {
      return Calendar.getInstance().apply {
        timeInMillis = now
        add(Calendar.DAY_OF_YEAR, 1)
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }.timeInMillis
    }

    private fun buildViews(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
      val preferences = context.getSharedPreferences(PREFS_NAME, 0)
      val groupId = preferences.getString(KEY_GROUP_ID, "").orEmpty()
      val groupName = preferences.getString(KEY_GROUP_NAME, "").orEmpty()
      val savedToday = preferences.getString(KEY_TODAY, "").orEmpty()
      val savedTomorrow = preferences.getString(KEY_TOMORROW, "").orEmpty()
      val snapshotDate = preferences.getString(KEY_SNAPSHOT_DATE, "").orEmpty()
      val datedSchedule = parseObject(preferences.getString(KEY_SCHEDULE_JSON, null))
      val structuredSchedule = parseObject(preferences.getString(KEY_EVENTS_JSON, null))
      val importantJson = preferences.getString(KEY_IMPORTANT_JSON, "[]").orEmpty()
      val accent = parseColor(preferences.getString(KEY_ACCENT_COLOR, null))

      val now = System.currentTimeMillis()
      val todayDate = Calendar.getInstance()
      val tomorrowDate = (todayDate.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, 1) }
      val yesterdayDate = (todayDate.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
      val keyFormatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val todayKey = keyFormatter.format(todayDate.time)
      val tomorrowKey = keyFormatter.format(tomorrowDate.time)
      val yesterdayKey = keyFormatter.format(yesterdayDate.time)

      // Older app versions only send plain-text lines for "today" and "tomorrow".
      val legacyToday = when (snapshotDate) {
        todayKey -> savedToday
        yesterdayKey -> savedTomorrow
        else -> null
      }
      val legacyTomorrow = if (snapshotDate == todayKey) savedTomorrow else null

      val todayAll = daySchedule(
        structuredSchedule,
        datedSchedule,
        todayKey,
        legacyToday,
        refreshMessage = "Open Planado to refresh today's plans",
        emptyFallback = "Nothing planned today",
      )
      // Plans that have ended drop off the list; the summary counts what is left.
      val finishedToday = todayAll.events.count { it.endMs in 1 until now }
      val today = todayAll.copy(events = todayAll.events.filterNot { it.endMs in 1 until now })
      val tomorrow = daySchedule(
        structuredSchedule,
        datedSchedule,
        tomorrowKey,
        legacyTomorrow,
        refreshMessage = "Open Planado to refresh tomorrow",
        emptyFallback = "Nothing planned",
      )

      val views = RemoteViews(context.packageName, R.layout.planado_widget)
      val configured = groupId.isNotBlank()
      val locale = Locale.getDefault()

      views.setTextViewText(R.id.widget_group_name, if (configured && groupName.isNotBlank()) groupName else "Planado")
      views.setTextViewText(
        R.id.widget_date_weekday,
        SimpleDateFormat("EEE", locale).format(todayDate.time).uppercase(locale),
      )
      views.setTextViewText(R.id.widget_date_day, todayDate.get(Calendar.DAY_OF_MONTH).toString())
      views.setTextViewText(
        R.id.widget_summary,
        if (configured) summaryFor(today, finishedToday, now) else "Choose a group to get started",
      )
      if (accent != null) applyAccent(context, views, accent)

      val groupTarget = if (configured) "planado://group/${Uri.encode(groupId)}" else "planado://groups"
      val addTarget = if (configured) "planado://event/create?groupId=${Uri.encode(groupId)}" else "planado://groups"
      views.setOnClickPendingIntent(android.R.id.background, openIntent(context, widgetId * 100, groupTarget))
      views.setOnClickPendingIntent(R.id.widget_add, openIntent(context, widgetId * 100 + 1, addTarget))

      if (!configured) {
        views.setTextViewText(
          R.id.widget_setup_hint,
          "Open a group in Planado and tap Make widget to see its plans here.",
        )
        views.setViewVisibility(R.id.widget_setup_hint, View.VISIBLE)
        views.setViewVisibility(R.id.widget_important_list, View.GONE)
        views.setViewVisibility(R.id.widget_today_section, View.GONE)
        views.setViewVisibility(R.id.widget_tomorrow_section, View.GONE)
        return views
      }
      views.setViewVisibility(R.id.widget_setup_hint, View.GONE)
      views.setViewVisibility(R.id.widget_today_section, View.VISIBLE)

      val heightDp = widgetHeightDp(manager, widgetId)
      var remaining = heightDp - CHROME_HEIGHT_DP

      val importantSlots = when {
        heightDp >= 240 -> 2
        heightDp >= 160 -> 1
        else -> 0
      }
      val important = importantEvents(importantJson, now).take(importantSlots)
      views.removeAllViews(R.id.widget_important_list)
      important.forEach { views.addView(R.id.widget_important_list, importantRow(context, it)) }
      views.setViewVisibility(R.id.widget_important_list, if (important.isEmpty()) View.GONE else View.VISIBLE)
      remaining -= important.size * IMPORTANT_ROW_HEIGHT_DP

      remaining -= SECTION_LABEL_HEIGHT_DP
      val todaySlots = (remaining / EVENT_ROW_HEIGHT_DP).coerceIn(1, 5)
      val todayRows = renderDay(
        context,
        views,
        today,
        todaySlots,
        now,
        accent,
        groupTarget,
        requestBase = widgetId * 100 + 10,
        listId = R.id.widget_today_list,
        emptyId = R.id.widget_today_empty,
        moreId = R.id.widget_today_more,
        emptyText = when {
          today.stale -> today.emptyMessage
          finishedToday > 0 -> "All done for today"
          else -> "Your day is wide open."
        },
      )
      // A one-line empty state leaves room for tomorrow, e.g. once today's plans are done.
      remaining -= if (todayRows == 0) EMPTY_ROW_HEIGHT_DP else todayRows * EVENT_ROW_HEIGHT_DP
      if (today.events.size > todayRows) remaining -= MORE_LINE_HEIGHT_DP

      val tomorrowFits = remaining >= SECTION_LABEL_HEIGHT_DP + EVENT_ROW_HEIGHT_DP - 6
      val tomorrowUseful = !(tomorrow.stale && today.stale)
      if (tomorrowFits && tomorrowUseful) {
        views.setViewVisibility(R.id.widget_tomorrow_section, View.VISIBLE)
        val tomorrowSlots = ((remaining - SECTION_LABEL_HEIGHT_DP) / EVENT_ROW_HEIGHT_DP).coerceIn(1, 4)
        val tomorrowDay = SimpleDateFormat("EEE d", locale).format(tomorrowDate.time).uppercase(locale)
        // Tomorrow sits at the bottom edge, so its count goes in the label, not a "+N more" line.
        val tomorrowCount = if (tomorrow.events.size > tomorrowSlots) " · ${tomorrow.events.size} PLANS" else ""
        views.setTextViewText(R.id.widget_tomorrow_label, "TOMORROW · $tomorrowDay$tomorrowCount")
        renderDay(
          context,
          views,
          tomorrow,
          tomorrowSlots,
          now,
          accent,
          groupTarget,
          requestBase = widgetId * 100 + 40,
          listId = R.id.widget_tomorrow_list,
          emptyId = R.id.widget_tomorrow_empty,
          moreId = R.id.widget_tomorrow_more,
          emptyText = tomorrow.emptyMessage,
          showMore = false,
        )
      } else {
        views.setViewVisibility(R.id.widget_tomorrow_section, View.GONE)
      }

      return views
    }

    private fun renderDay(
      context: Context,
      views: RemoteViews,
      schedule: DaySchedule,
      slots: Int,
      now: Long,
      accent: Int?,
      groupTarget: String,
      requestBase: Int,
      listId: Int,
      emptyId: Int,
      moreId: Int,
      emptyText: String,
      showMore: Boolean = true,
    ): Int {
      views.removeAllViews(listId)

      if (schedule.events.isEmpty()) {
        views.setViewVisibility(listId, View.GONE)
        views.setViewVisibility(moreId, View.GONE)
        views.setViewVisibility(emptyId, View.VISIBLE)
        views.setTextViewText(emptyId, emptyText.ifBlank { "Nothing planned" })
        return 0
      }

      views.setViewVisibility(emptyId, View.GONE)
      views.setViewVisibility(listId, View.VISIBLE)
      val visible = schedule.events.take(slots)
      visible.forEachIndexed { index, event ->
        views.addView(listId, eventRow(context, event, now, accent, groupTarget, requestBase + index))
      }

      val hidden = schedule.events.size - visible.size
      if (hidden > 0 && showMore) {
        views.setViewVisibility(moreId, View.VISIBLE)
        views.setTextViewText(moreId, "+$hidden more")
      } else {
        views.setViewVisibility(moreId, View.GONE)
      }
      return visible.size
    }

    private fun eventRow(
      context: Context,
      event: WidgetEvent,
      now: Long,
      accent: Int?,
      groupTarget: String,
      requestCode: Int,
    ): RemoteViews {
      val row = RemoteViews(context.packageName, R.layout.planado_widget_event_row)
      val live = event.startMs in 1..now && event.endMs >= now
      val past = event.endMs in 1 until now

      row.setTextViewText(R.id.row_time, if (live) "Now" else event.time.ifBlank { "—" })
      row.setTextViewText(R.id.row_title, event.title)
      if (event.detail.isNotBlank()) {
        row.setViewVisibility(R.id.row_detail, View.VISIBLE)
        row.setTextViewText(R.id.row_detail, event.detail)
      } else {
        row.setViewVisibility(R.id.row_detail, View.GONE)
      }

      val barColor = event.color ?: accent
      if (barColor != null) row.setInt(R.id.row_bar, "setColorFilter", barColor)
      if (past) {
        row.setInt(R.id.row_bar, "setImageAlpha", 90)
        row.setTextColorResource(context, R.id.row_title, R.color.planado_widget_muted)
      }
      if (live) {
        if (accent != null) {
          row.setThemedColor(context, R.id.row_time, "setTextColor", readableOnLight(accent), readableOnDark(accent))
        } else {
          row.setTextColorResource(context, R.id.row_time, R.color.planado_widget_accent)
        }
      }

      val label = buildString {
        append(if (live) "Happening now" else event.time)
        append(", ")
        append(event.title)
        if (event.detail.isNotBlank()) append(", ").append(event.detail)
      }
      row.setContentDescription(R.id.row_root, label)

      val target = event.id?.let { "planado://event/${Uri.encode(it)}" } ?: groupTarget
      row.setOnClickPendingIntent(R.id.row_root, openIntent(context, requestCode, target))
      return row
    }

    private fun importantRow(context: Context, event: ImportantEvent): RemoteViews {
      return RemoteViews(context.packageName, R.layout.planado_widget_important_row).apply {
        setTextViewText(R.id.important_title, event.title)
        setTextViewText(R.id.important_countdown, event.countdown)
        setContentDescription(R.id.important_root, "Important: ${event.title}, ${event.description}")
      }
    }

    private fun applyAccent(context: Context, views: RemoteViews, accent: Int) {
      val light = readableOnLight(accent)
      val dark = readableOnDark(accent)
      views.setThemedColor(context, R.id.widget_date_weekday, "setTextColor", light, dark)
      views.setThemedColor(context, R.id.widget_date_day, "setTextColor", light, dark)
      views.setThemedColor(context, R.id.widget_today_label, "setTextColor", light, dark)
      views.setInt(R.id.widget_date_tile, "setColorFilter", accent)
      views.setInt(R.id.widget_date_tile, "setImageAlpha", 40)
      views.setInt(R.id.widget_add_fill, "setColorFilter", accent)
    }

    private fun summaryFor(today: DaySchedule, finished: Int, now: Long): String {
      if (today.stale) return today.emptyMessage
      val count = today.events.size
      if (count == 0) return if (finished > 0) "All done for today" else today.emptyMessage

      val label = when {
        finished > 0 -> "$count left today"
        count == 1 -> "1 plan today"
        else -> "$count plans today"
      }
      val live = today.events.firstOrNull { it.startMs in 1..now && it.endMs >= now }
      val next = today.events.firstOrNull { !it.allDay && it.startMs > now }
      return when {
        live != null -> "$label · one happening now"
        next != null -> "$label · next ${next.time}"
        else -> label
      }
    }

    private fun daySchedule(
      structured: JSONObject?,
      dated: JSONObject?,
      dayKey: String,
      legacyText: String?,
      refreshMessage: String,
      emptyFallback: String,
    ): DaySchedule {
      val datedText = if (dated != null && dated.has(dayKey)) dated.optString(dayKey) else null
      val structuredEvents = structuredEvents(structured, dayKey)
      if (structuredEvents != null) {
        return DaySchedule(structuredEvents, emptyMessage(datedText.orEmpty(), emptyFallback), stale = false)
      }

      val text = datedText ?: legacyText ?: return DaySchedule(emptyList(), refreshMessage, stale = true)
      return DaySchedule(textEvents(text), emptyMessage(text, emptyFallback), stale = false)
    }

    private fun structuredEvents(json: JSONObject?, dayKey: String): List<WidgetEvent>? {
      if (json == null || !json.has(dayKey)) return null
      val items = json.optJSONArray(dayKey) ?: return emptyList()
      return (0 until items.length()).mapNotNull { index ->
        val item = items.optJSONObject(index) ?: return@mapNotNull null
        val title = item.optString("title").replace('\n', ' ').trim()
        if (title.isEmpty()) return@mapNotNull null
        WidgetEvent(
          id = item.optString("id").takeIf { it.isNotBlank() },
          time = item.optString("time").trim(),
          title = title,
          detail = item.optString("detail").replace('\n', ' ').trim(),
          color = parseColor(item.optString("color")),
          allDay = item.optBoolean("allDay"),
          startMs = item.optLong("startMs", 0L),
          endMs = item.optLong("endMs", 0L),
        )
      }
    }

    /** Parses the plain-text lines older app versions send: "9:00 AM  Title  ·  Room". */
    private fun textEvents(text: String): List<WidgetEvent> {
      return text.lines()
        .map { it.trim() }
        .filter { it.contains("  ") }
        .map { line ->
          val time = line.substringBefore("  ").trim()
          val rest = line.substringAfter("  ").trim()
          val title = rest.substringBefore("  ·  ").trim()
          val detail = if (rest.contains("  ·  ")) rest.substringAfter("  ·  ").trim() else ""
          WidgetEvent(null, time, title, detail, null, time.equals("All day", ignoreCase = true), 0L, 0L)
        }
    }

    private fun emptyMessage(text: String, fallback: String): String {
      return text.lines().map { it.trim() }.firstOrNull { it.isNotEmpty() && !it.contains("  ") } ?: fallback
    }

    private fun importantEvents(json: String, nowMs: Long): List<ImportantEvent> {
      val items = try { JSONArray(json) } catch (_: Exception) { JSONArray() }
      val today = startOfDay(nowMs)
      val events = mutableListOf<ImportantEvent>()

      for (index in 0 until items.length()) {
        val item = items.optJSONObject(index) ?: continue
        val title = item.optString("title").replace('\n', ' ').trim().take(60)
        val startMs = item.optLong("startMs", 0L)
        val endMs = item.optLong("endMs", 0L)
        if (title.isBlank() || startMs <= 0L || endMs < nowMs) continue

        val (countdown, description) = if (startMs <= nowMs) {
          "Now" to "happening now"
        } else {
          val days = TimeUnit.MILLISECONDS.toDays(startOfDay(startMs) - today).toInt()
          when {
            days <= 0 -> "Today" to "today"
            days == 1 -> "1 day" to "1 day left"
            else -> "$days days" to "$days days left"
          }
        }
        events.add(ImportantEvent(title, countdown, description))
        if (events.size == 3) break
      }
      return events
    }

    private fun startOfDay(timeMs: Long): Long {
      return Calendar.getInstance().apply {
        timeInMillis = timeMs
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }.timeInMillis
    }

    /** Portrait launchers report the usable height as the max height. */
    private fun widgetHeightDp(manager: AppWidgetManager, widgetId: Int): Int {
      val options = manager.getAppWidgetOptions(widgetId)
      val maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
      val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
      val height = if (maxHeight > 0) maxHeight else minHeight
      return if (height > 0) height else DEFAULT_HEIGHT_DP
    }

    private fun openIntent(context: Context, requestCode: Int, target: String): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target), context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun parseObject(json: String?): JSONObject? {
      if (json.isNullOrBlank()) return null
      return try { JSONObject(json) } catch (_: Exception) { null }
    }

    private fun parseColor(value: String?): Int? {
      if (value.isNullOrBlank()) return null
      return try { Color.parseColor(value.trim()) } catch (_: IllegalArgumentException) { null }
    }

    /** Darkens light group colors so small text stays readable on the light surface. */
    private fun readableOnLight(color: Int): Int = blend(color, Color.BLACK, 0.18f)

    /** Lightens group colors so text stays readable on the dark surface. */
    private fun readableOnDark(color: Int): Int = blend(color, Color.WHITE, 0.42f)

    private fun blend(color: Int, target: Int, ratio: Float): Int {
      val keep = 1f - ratio
      return Color.rgb(
        (Color.red(color) * keep + Color.red(target) * ratio).roundToInt(),
        (Color.green(color) * keep + Color.green(target) * ratio).roundToInt(),
        (Color.blue(color) * keep + Color.blue(target) * ratio).roundToInt(),
      )
    }

    private fun isNightMode(context: Context): Boolean {
      val mode = context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
      return mode == Configuration.UI_MODE_NIGHT_YES
    }

    /** Light/dark color pair. Android 12+ switches it live with the system theme. */
    private fun RemoteViews.setThemedColor(context: Context, viewId: Int, method: String, light: Int, dark: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setColorInt(viewId, method, light, dark)
      } else {
        setInt(viewId, method, if (isNightMode(context)) dark else light)
      }
    }

    /** Applies a theme-aware color resource to a TextView's text. */
    private fun RemoteViews.setTextColorResource(context: Context, viewId: Int, colorRes: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setColorStateList(viewId, "setTextColor", colorRes)
      } else {
        setTextColor(viewId, context.getColor(colorRes))
      }
    }
  }
}
