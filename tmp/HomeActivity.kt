package com.example.prohive_management

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import androidx.cardview.widget.CardView
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.max

class HomeActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences("prohive_prefs", Context.MODE_PRIVATE) }
    private val session by lazy { AuthSessionManager(this) }
    private val trustedTime by lazy { TrustedTimeManager(this) }
    private var activeNoticeDialog: AlertDialog? = null
    private val queueSyncHandler = Handler(Looper.getMainLooper())
    private val queueSyncTicker = object : Runnable {
        override fun run() {
            retryQueuedPunchesAsync()
            queueSyncHandler.postDelayed(this, QUEUE_RETRY_POLL_MS)
        }
    }

    private lateinit var swipeContainer: View
    private lateinit var swipeCard: CardView
    private lateinit var swipeThumb: CardView
    private lateinit var tvSwipeText: TextView
    private lateinit var tvThumb: TextView
    private lateinit var tvWelcomeEmp: TextView
    private lateinit var tvCompanyName: TextView
    private lateinit var tvCompanyTagline: TextView
    private lateinit var tvEmpInfo: TextView
    private lateinit var tvWorkingHours: TextView
    private lateinit var tvTodayDate: TextView
    private lateinit var tvPunchInTime: TextView
    private lateinit var tvPunchOutTime: TextView
    private lateinit var processingOverlay: View
    private lateinit var cardLeave: CardView
    private lateinit var cardCalendar: CardView
    private lateinit var cardClaims: CardView
    private lateinit var cardCorrection: CardView
    private lateinit var cardProfile: CardView

    private var startX = 0f
    private var dX = 0f
    private var swipeMax = 0f
    private var isPunchedIn = false
    private var isProcessing = false

    private val reqLoc = 101
    private var pendingPunchAction: PunchAction? = null

    private val fusedClient by lazy { LocationServices.getFusedLocationProviderClient(this) }

    companion object {
        private const val MAX_CLOCK_DRIFT_MS = 120_000L
        private const val MAX_ACCURACY_M = 80f
        private const val MAX_LOCATION_AGE_MS = 120_000L
        private const val MAX_QUEUE_ATTEMPTS = 6
        private const val QUEUE_RETRY_POLL_MS = 20_000L
    }

    enum class PunchAction { IN, OUT }

    private fun getShiftStartMin(): Int = prefs.getInt("shift_start_min", 600)
    private fun getEarlyWindowMin(): Int = prefs.getInt("early_window_min", 15)
    private fun getMinWorkBeforeOutMin(): Int = prefs.getInt("min_work_before_out_min", 60)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (!session.hasActivatedDevice()) {
            showNotice("Employee session missing. Please sign in again.")
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_home)
        bindViews()

        swipeContainer.post {
            swipeMax = (swipeContainer.width - swipeThumb.width).toFloat()
        }

        swipeThumb.setOnTouchListener { v, event ->
            if (event.action == MotionEvent.ACTION_UP) v.performClick()
            handleSwipe(event)
        }

        refreshUI()
        syncTodaySummaryFromServerAsync()
        retryQueuedPunchesAsync()
    }

    override fun onResume() {
        super.onResume()
        refreshUI()
        syncTodaySummaryFromServerAsync()
        retryQueuedPunchesAsync()
        startQueueSyncTicker()
    }

    override fun onPause() {
        super.onPause()
        stopQueueSyncTicker()
    }

    override fun onDestroy() {
        stopQueueSyncTicker()
        activeNoticeDialog?.dismiss()
        activeNoticeDialog = null
        super.onDestroy()
    }

    private fun startQueueSyncTicker() {
        queueSyncHandler.removeCallbacks(queueSyncTicker)
        queueSyncHandler.post(queueSyncTicker)
    }

    private fun stopQueueSyncTicker() {
        queueSyncHandler.removeCallbacks(queueSyncTicker)
    }

    private fun bindViews() {
        swipeContainer = findViewById(R.id.swipeContainer)
        swipeCard = findViewById(R.id.swipeCard)
        swipeThumb = findViewById(R.id.swipeThumb)
        tvSwipeText = findViewById(R.id.tvSwipeText)
        tvThumb = findViewById(R.id.tvThumb)
        tvWelcomeEmp = findViewById(R.id.tvWelcomeEmp)
        tvCompanyName = findViewById(R.id.tvCompanyName)
        tvCompanyTagline = findViewById(R.id.tvCompanyTagline)
        tvEmpInfo = findViewById(R.id.tvEmpInfo)
        tvWorkingHours = findViewById(R.id.tvWorkingHours)
        tvTodayDate = findViewById(R.id.tvTodayDate)
        tvPunchInTime = findViewById(R.id.tvPunchInTime)
        tvPunchOutTime = findViewById(R.id.tvPunchOutTime)
        processingOverlay = findViewById(R.id.processingOverlay)
        cardLeave = findViewById(R.id.cardLeave)
        cardCalendar = findViewById(R.id.cardCalendar)
        cardClaims = findViewById(R.id.cardClaims)
        cardCorrection = findViewById(R.id.cardAttendance)
        cardProfile = findViewById(R.id.cardProfile)

        cardLeave.setOnClickListener { startActivity(Intent(this, LeaveActivity::class.java)) }
        cardCalendar.setOnClickListener { startActivity(Intent(this, CalendarActivity::class.java)) }
        cardClaims.setOnClickListener { startActivity(Intent(this, ClaimsActivity::class.java)) }
        cardCorrection.setOnClickListener { startActivity(Intent(this, CorrectionActivity::class.java)) }
        cardProfile.setOnClickListener { startActivity(Intent(this, ProfileActivity::class.java)) }
    }

    private fun refreshUI() {
        dailyResetIfNeeded()
        loadState()
        renderHeader()
        renderTodayDate()
        renderPunchUI()
        resetThumbInstant()
    }

    private fun dailyResetIfNeeded() {
        val todayKey = getTodayKey()
        val lastKey = prefs.getInt("last_date_key", 0)

        if (lastKey == 0) {
            prefs.edit().putInt("last_date_key", todayKey).apply()
            return
        }

        if (todayKey != lastKey) {
            prefs.edit()
                .putInt("last_date_key", todayKey)
                .putBoolean("punched_in_today", false)
                .putLong("punch_in_time", 0L)
                .putLong("punch_out_time", 0L)
                .putBoolean("late_marked_today", false)
                .putBoolean("half_day_today", false)
                .putBoolean("late_popup_shown_today", false)
                .apply()
        }
    }

    private fun loadState() {
        val inTime = prefs.getLong("punch_in_time", 0L)
        val outTime = prefs.getLong("punch_out_time", 0L)
        isPunchedIn = inTime > 0L && outTime == 0L
    }

    private fun isDayCompleted(): Boolean {
        val inTime = prefs.getLong("punch_in_time", 0L)
        val outTime = prefs.getLong("punch_out_time", 0L)
        return inTime > 0L && outTime > 0L
    }

    private fun renderHeader() {
        val companyName = session.companyName()?.trim().takeUnless { it.isNullOrBlank() } ?: "Client Company Name"
        val companyTagline = session.companyTagline()?.trim().orEmpty()
        val empName = session.employeeName()?.trim().takeUnless { it.isNullOrBlank() }
            ?: prefs.getString("emp_name", "Emp Name")
            ?: "Emp Name"
        val empCode = session.employeeCode()?.trim().takeUnless { it.isNullOrBlank() } ?: "EMP001"
        val designation = session.designation()?.trim().takeUnless { it.isNullOrBlank() } ?: "Employee"

        tvCompanyName.text = companyName
        if (companyTagline.isBlank()) {
            tvCompanyTagline.text = ""
            tvCompanyTagline.visibility = View.GONE
        } else {
            tvCompanyTagline.text = companyTagline
            tvCompanyTagline.visibility = View.VISIBLE
        }

        tvWelcomeEmp.text = "Welcome, $empName"
        tvEmpInfo.text = "$empCode • $designation"
    }

    private fun renderTodayDate() {
        val df = SimpleDateFormat("dd MMM yyyy", Locale.ENGLISH)
        tvTodayDate.text = df.format(Date())
    }

    private fun renderPunchUI() {
        val punchInTime = prefs.getLong("punch_in_time", 0L)
        val punchOutTime = prefs.getLong("punch_out_time", 0L)

        tvPunchInTime.text = formatTimeOrDash(punchInTime)
        tvPunchOutTime.text = formatTimeOrDash(punchOutTime)

        if (punchInTime > 0L && punchOutTime > 0L) {
            swipeCard.setCardBackgroundColor(Color.parseColor("#616161"))
            swipeThumb.setCardBackgroundColor(Color.parseColor("#424242"))
            tvSwipeText.text = "COMPLETED FOR TODAY"
            tvThumb.text = "\uD83D\uDD12"

            val mins = ((punchOutTime - punchInTime) / 60000L).toInt()
            tvWorkingHours.text = formatMinutes(max(mins, 0))
            setSwipeEnabled(false)
            return
        }

        setSwipeEnabled(!isProcessing)

        if (!isPunchedIn) {
            swipeCard.setCardBackgroundColor(Color.parseColor("#2E7D32"))
            swipeThumb.setCardBackgroundColor(Color.parseColor("#1B5E20"))
            tvSwipeText.text = "SWIPE TO PUNCH IN"
            tvThumb.text = "\u279C"
            tvWorkingHours.text = "00:00"
            return
        }

        swipeCard.setCardBackgroundColor(Color.parseColor("#C62828"))
        swipeThumb.setCardBackgroundColor(Color.parseColor("#8E0000"))
        tvSwipeText.text = "SWIPE TO PUNCH OUT"
        tvThumb.text = "\u279C"

        val inTime = prefs.getLong("punch_in_time", 0L)
        if (inTime > 0L) {
            val minsRunning = ((System.currentTimeMillis() - inTime) / 60000L).toInt()
            tvWorkingHours.text = formatMinutes(max(minsRunning, 0))
        } else {
            tvWorkingHours.text = "00:00"
        }
    }

    private fun setSwipeEnabled(enabled: Boolean) {
        swipeThumb.isEnabled = enabled
        swipeContainer.isEnabled = enabled
        swipeCard.alpha = if (enabled) 1.0f else 0.92f
    }

    private fun handleSwipe(event: MotionEvent): Boolean {
        if (isProcessing || isDayCompleted() || !swipeThumb.isEnabled) return true

        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                startX = event.rawX
                dX = swipeThumb.translationX
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                val move = dX + (event.rawX - startX)
                swipeThumb.translationX = move.coerceIn(0f, swipeMax)
                return true
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                val threshold = swipeMax * 0.70f
                if (swipeThumb.translationX >= threshold) {
                    resetThumb()
                    onSwipeCompleted()
                } else {
                    resetThumb()
                }
                return true
            }
        }

        return false
    }

    private fun resetThumb() {
        swipeThumb.animate().translationX(0f).setDuration(140).start()
    }

    private fun resetThumbInstant() {
        swipeThumb.translationX = 0f
    }

    private fun onSwipeCompleted() {
        if (!isAutoTimeEnabled() || !isAutoTimeZoneEnabled()) {
            showNotice("Date and Time must be set to Auto for Punch In or Punch Out.") {
                redirectDateTimeSettings()
            }
            return
        }

        val currentDeviceId = DeviceUtils.deviceId(this)
        val boundDeviceId = session.deviceId()
        if (boundDeviceId.isNullOrBlank() || boundDeviceId != currentDeviceId) {
            showNotice("This device is not authorized for attendance punch.")
            return
        }

        val inTime = prefs.getLong("punch_in_time", 0L)
        val outTime = prefs.getLong("punch_out_time", 0L)

        if (inTime > 0L && outTime > 0L) {
            showNotice("Your attendance is already completed for today.")
            resetThumb()
            return
        }

        val action = if (inTime == 0L) PunchAction.IN else PunchAction.OUT

        if (action == PunchAction.IN) {
            val nowMin = nowMinutesOfDay()
            val shiftStart = getShiftStartMin()
            val earlyAllowed = shiftStart - getEarlyWindowMin()
            if (nowMin < earlyAllowed) {
                showNotice("Punch In will be available after ${formatMinuteToTime(earlyAllowed)}.")
                resetThumb()
                return
            }
        }

        if (action == PunchAction.OUT) {
            if (inTime <= 0L) {
                showNotice("Punch In is required before Punch Out.")
                resetThumb()
                return
            }

            val minWait = getMinWorkBeforeOutMin()
            val diffMin = ((System.currentTimeMillis() - inTime) / 60000L).toInt()
            if (diffMin < minWait) {
                showNotice("Punch Out will be available after $minWait minutes from Punch In.")
                resetThumb()
                return
            }
        }

        pendingPunchAction = action
        if (!hasLocationPermission()) {
            requestLocationPermission()
            return
        }

        performPunchWithLocation(action)
    }

    private fun isAutoTimeEnabled(): Boolean {
        return Settings.Global.getInt(contentResolver, Settings.Global.AUTO_TIME, 0) == 1
    }

    private fun isAutoTimeZoneEnabled(): Boolean {
        return Settings.Global.getInt(contentResolver, Settings.Global.AUTO_TIME_ZONE, 0) == 1
    }

    private fun redirectDateTimeSettings() {
        startActivity(Intent(Settings.ACTION_DATE_SETTINGS))
    }

    private fun redirectMockLocationSettings() {
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
        } catch (_: Exception) {
            startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
        }
    }


    private fun showNotice(message: String, onClose: (() -> Unit)? = null) {
        if (isFinishing || isDestroyed) return
        activeNoticeDialog?.dismiss()
        activeNoticeDialog = AlertDialog.Builder(this)
            .setTitle("Action Required")
            .setMessage(message)
            .setCancelable(false)
            .setPositiveButton("Close") { dialog, _ ->
                dialog.dismiss()
                onClose?.invoke()
            }
            .create()
        activeNoticeDialog?.show()
    }
    private fun hasLocationPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION),
            reqLoc
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != reqLoc) return
        val granted = grantResults.isNotEmpty() && grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        if (!granted) {
            showNotice("Precise location access is required for attendance punch.")
            return
        }
        pendingPunchAction?.let { performPunchWithLocation(it) }
    }

    @SuppressLint("MissingPermission")
    private fun performPunchWithLocation(action: PunchAction) {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            showNotice("Location service is turned off. Please enable GPS and try again.") {
                startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            }
            return
        }

        showProcessing(true)
        fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { loc ->
                if (loc != null) {
                    processPunch(action, loc)
                } else {
                    showProcessing(false)
                    showNotice("Unable to fetch your location. Please try again.")
                }
            }
            .addOnFailureListener {
                showProcessing(false)
                showNotice("Unable to fetch your location. Please try again.")
            }
    }

    private fun processPunch(action: PunchAction, location: Location) {
        if (isMockLocation(location)) {
            showProcessing(false)
            showNotice("Suspicious location activity detected. Disable Fake GPS and try again.") {
                redirectMockLocationSettings()
            }
            return
        }

        if (!isLocationFresh(location)) {
            showProcessing(false)
            showNotice("Current location could not be verified. Please try again.")
            return
        }

        if (location.accuracy > MAX_ACCURACY_M) {
            showProcessing(false)
            showNotice("Location accuracy is low. Move to an open area and try again.")
            return
        }

        if (!passesOfficeGeofence(location)) {
            showProcessing(false)
            showNotice("You are outside the allowed office area for attendance punch.")
            return
        }

        Thread {
            val nowMs = System.currentTimeMillis()
            val elapsedMs = SystemClock.elapsedRealtime()
            val online = hasInternetConnection()
            val address = reverseGeocodeAddress(location)

            if (online && address.isBlank()) {
                runOnUiThread {
                    showProcessing(false)
                    showNotice("Address is required for online punch. Please try again.")
                }
                return@Thread
            }

            val trustedSnapshot = trustedTime.snapshot()
            val estimatedTimeMs = trustedSnapshot?.let { it.serverTimeMs + (elapsedMs - it.elapsedMs) }
            val clockDriftMs = estimatedTimeMs?.let { nowMs - it }

            var requiresApproval = false
            val reasons = mutableListOf<String>()
            if (clockDriftMs != null && abs(clockDriftMs) > MAX_CLOCK_DRIFT_MS) {
                requiresApproval = true
                reasons.add("CLOCK_DRIFT")
            }

            val payload = JSONObject()
                .put("event_id", UUID.randomUUID().toString())
                .put("company_id", session.companyId().orEmpty())
                .put("employee_id", session.employeeId().orEmpty())
                .put("device_id", session.deviceId().orEmpty())
                .put("punch_type", if (action == PunchAction.IN) "in" else "out")
                .put("lat", location.latitude)
                .put("lon", location.longitude)
                .put("address", if (address.isBlank()) JSONObject.NULL else address)
                .put("accuracy_m", location.accuracy)
                .put("device_time_ms", nowMs)
                .put("elapsed_ms", elapsedMs)
                .put("device_time_zone", TimeZone.getDefault().id)
                .put("estimated_time_ms", estimatedTimeMs ?: JSONObject.NULL)
                .put("trusted_anchor_time_ms", trustedSnapshot?.serverTimeMs ?: JSONObject.NULL)
                .put("trusted_anchor_elapsed_ms", trustedSnapshot?.elapsedMs ?: JSONObject.NULL)
                .put("clock_drift_ms", clockDriftMs ?: JSONObject.NULL)
                .put("requires_approval", requiresApproval)
                .put("approval_reason_codes", JSONArray(reasons))
                .put("is_offline", !online)

            val result = submitPunchPayload(payload, online)

            runOnUiThread {
                showProcessing(false)
                if (!result.accepted) {
                    if (result.forceSummaryRefresh) {
                        syncTodaySummaryFromServerAsync()
                    }
                    showNotice(result.userMessage.ifBlank { "Punch request could not be completed. Please try again." })
                    return@runOnUiThread
                }

                updateLocalPunchState(action, result.effectivePunchMs ?: nowMs)
                renderPunchUI()
                syncTodaySummaryFromServerAsync()
                val actionLabel = if (action == PunchAction.IN) "Punch In" else "Punch Out"

                if (result.pendingApproval) {
                    showNotice("$actionLabel submitted successfully. Your record is pending review.")
                } else if (result.queuedOffline) {
                    showNotice("$actionLabel saved offline and will sync automatically.")
                } else {
                    showNotice("$actionLabel recorded successfully.")
                }
            }
        }.start()
    }

    private fun submitPunchPayload(payload: JSONObject, online: Boolean): PunchDecisionResult {
        if (!online) {
            val queuedPayload = JSONObject(payload.toString()).put("is_offline", true)
            PunchQueue.enqueue(this, queuedPayload)
            return PunchDecisionResult(accepted = true, queuedOffline = true)
        }

        val response = PunchApi.sendPunchSync(payload)
        if (response.ok) {
            trustedTime.update(response.serverTimeMs)
            val approvalStatus = response.body?.optString("approvalStatus").orEmpty()
            val effectiveIso = response.body?.optString("effectivePunchAt").orEmpty()
            return PunchDecisionResult(
                accepted = true,
                queuedOffline = false,
                pendingApproval = approvalStatus == "pending_approval",
                effectivePunchMs = parseIsoToMillis(effectiveIso)
            )
        }

        if (response.errorCode == "DUPLICATE_EVENT") {
            return PunchDecisionResult(accepted = true, queuedOffline = false)
        }

        val shouldQueue = response.code == -1 || response.code >= 500
        if (shouldQueue) {
            val queuedPayload = JSONObject(payload.toString()).put("is_offline", true)
            PunchQueue.enqueue(this, queuedPayload)
            return PunchDecisionResult(
                accepted = true,
                queuedOffline = true,
                userMessage = "Network issue detected. Punch saved offline and will sync automatically."
            )
        }

        val friendlyMessage = mapPunchFailureMessage(response.errorCode, response.message)
        val shouldRefreshSummary =
            response.errorCode == "INVALID_PUNCH_SEQUENCE" ||
            response.errorCode == "PUNCH_IN_REQUIRED" ||
            response.errorCode == "DUPLICATE_EVENT"
        return PunchDecisionResult(
            accepted = false,
            userMessage = friendlyMessage,
            forceSummaryRefresh = shouldRefreshSummary
        )
    }

    private fun mapPunchFailureMessage(errorCode: String?, serverMessage: String): String {
        return when (errorCode) {
            "INVALID_PUNCH_SEQUENCE" -> "Your punch is already recorded. Please wait for sync update."
            "PUNCH_IN_REQUIRED" -> "Punch In is required before Punch Out."
            "DEVICE_MISMATCH", "DEVICE_NOT_BOUND" -> "This device is not authorized for attendance punch."
            "MOCK_LOCATION_DETECTED" -> "Suspicious location activity detected. Disable Fake GPS and try again."
            "ADDRESS_REQUIRED" -> "Address is required for online punch. Please try again."
            "OUTSIDE_OFFICE_RADIUS" -> "You are outside the allowed office area for attendance punch."
            "ACCESS_BLOCKED" -> "Punch is currently restricted for this employee."
            else -> serverMessage.ifBlank { "Punch request could not be completed. Please try again." }
        }
    }

    private fun updateLocalPunchState(action: PunchAction, eventMs: Long) {
        if (action == PunchAction.IN) {
            prefs.edit()
                .putLong("punch_in_time", eventMs)
                .putLong("punch_out_time", 0L)
                .apply()
            isPunchedIn = true
        } else {
            prefs.edit()
                .putLong("punch_out_time", eventMs)
                .apply()
            isPunchedIn = false
        }
    }

    private fun retryQueuedPunchesAsync() {
        if (!hasInternetConnection()) return

        Thread {
            val now = System.currentTimeMillis()
            val queued = PunchQueue.peekAll(this)
            for (item in queued) {
                val payload = item.optJSONObject("payload") ?: continue
                val eventId = payload.optString("event_id")
                if (eventId.isBlank()) continue

                val attemptCount = item.optInt("attemptCount", 0)
                if (attemptCount >= MAX_QUEUE_ATTEMPTS) continue

                val lastAttemptAt = item.optLong("lastAttemptAt", 0L)
                if (lastAttemptAt > 0L) {
                    val waitMs = retryBackoffMs(attemptCount)
                    if (now - lastAttemptAt < waitMs) continue
                }

                val result = PunchApi.sendPunchSync(payload)
                if (result.ok || result.errorCode == "DUPLICATE_EVENT") {
                    PunchQueue.removeByEventId(this, eventId)
                    trustedTime.update(result.serverTimeMs)
                    runOnUiThread { syncTodaySummaryFromServerAsync() }
                } else {
                    PunchQueue.markAttempt(this, eventId, result.message)
                }
            }
        }.start()
    }

    private fun retryBackoffMs(attemptCount: Int): Long {
        return when (attemptCount) {
            0 -> 10_000L
            1 -> 30_000L
            2 -> 120_000L
            3 -> 300_000L
            else -> 600_000L
        }
    }

    private fun hasInternetConnection(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun isMockLocation(location: Location): Boolean {
        return location.isFromMockProvider
    }

    private fun isLocationFresh(location: Location): Boolean {
        val ageMs = (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000L
        return ageMs in 0..MAX_LOCATION_AGE_MS
    }

    private fun passesOfficeGeofence(location: Location): Boolean {
        if (session.attendanceMode() != "office_only") return true
        val officeLat = session.officeLat() ?: return false
        val officeLon = session.officeLon() ?: return false
        val officeRadius = session.officeRadiusM() ?: return false

        val distance = FloatArray(1)
        Location.distanceBetween(
            officeLat,
            officeLon,
            location.latitude,
            location.longitude,
            distance
        )
        return distance[0] <= officeRadius
    }

    @Suppress("DEPRECATION")
    private fun reverseGeocodeAddress(location: Location): String {
        return try {
            val geocoder = Geocoder(this, Locale.ENGLISH)
            val addresses = geocoder.getFromLocation(location.latitude, location.longitude, 1)
            addresses?.firstOrNull()?.getAddressLine(0)?.trim().orEmpty()
        } catch (_: Exception) {
            ""
        }
    }

    private fun parseIsoToMillis(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        val rawValue = iso.trim()
        val value = normalizeIsoForParsing(rawValue)
        val patterns = arrayOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
        )
        for (pattern in patterns) {
            try {
                val parser = SimpleDateFormat(pattern, Locale.ENGLISH).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                    isLenient = false
                }
                val parsed = parser.parse(value)
                if (parsed != null) return parsed.time
            } catch (_: Exception) {
            }
        }
        return null
    }

    private fun normalizeIsoForParsing(value: String): String {
        if (value.isBlank()) return value
        if (!value.contains('T')) return value

        val zValue = if (value.endsWith("Z", ignoreCase = true)) {
            value.dropLast(1) + "+00:00"
        } else {
            value
        }

        val tzStart = zValue.indexOfLast { it == '+' || it == '-' }
        val timeStart = zValue.indexOf('T')
        if (tzStart <= timeStart) return zValue

        val mainPart = zValue.substring(0, tzStart)
        val tzPart = zValue.substring(tzStart)
        val dotIndex = mainPart.indexOf('.')
        if (dotIndex < 0) return mainPart + tzPart

        val prefix = mainPart.substring(0, dotIndex)
        val fraction = mainPart.substring(dotIndex + 1)
        val millis = when {
            fraction.length >= 3 -> fraction.substring(0, 3)
            fraction.isNotEmpty() -> fraction.padEnd(3, '0')
            else -> "000"
        }
        return "$prefix.$millis$tzPart"
    }

    private fun syncTodaySummaryFromServerAsync() {
        val employeeId = session.employeeId().orEmpty()
        val companyId = session.companyId().orEmpty()
        val deviceId = session.deviceId().orEmpty()
        if (employeeId.isBlank() || companyId.isBlank() || deviceId.isBlank()) return
        if (!hasInternetConnection()) return

        Thread {
            val result = MobileHomeApi.loadSummary(employeeId, companyId, deviceId, TimeZone.getDefault().id)
            if (!result.ok) return@Thread

            val employee = result.body.optJSONObject("employee")
            val today = result.body.optJSONObject("today")
            val serverStatus = today?.optString("status").orEmpty()
            val punchInAt = parseIsoToMillis(today?.optString("punchInAt"))
            val punchOutAt = parseIsoToMillis(today?.optString("punchOutAt"))
            val existingPunchIn = prefs.getLong("punch_in_time", 0L)
            val existingPunchOut = prefs.getLong("punch_out_time", 0L)

            if (employee != null) {
                session.updateProfileSnapshot(
                    companyName = employee.optString("companyName").takeIf { it.isNotBlank() },
                    companyTagline = employee.optString("companyTagline"),
                    designation = employee.optString("designation").takeIf { it.isNotBlank() }
                )
            }

            prefs.edit().apply {
                val todayKey = getTodayKey()
                putInt("last_date_key", todayKey)
                if (serverStatus == "NOT_PUNCHED_IN") {
                    putLong("punch_in_time", 0L)
                    putLong("punch_out_time", 0L)
                } else {
                    when {
                        punchInAt != null && punchInAt > 0L -> putLong("punch_in_time", punchInAt)
                        existingPunchIn > 0L -> putLong("punch_in_time", existingPunchIn)
                        else -> putLong("punch_in_time", 0L)
                    }
                    when {
                        punchOutAt != null && punchOutAt > 0L -> putLong("punch_out_time", punchOutAt)
                        existingPunchOut > 0L -> putLong("punch_out_time", existingPunchOut)
                        else -> putLong("punch_out_time", 0L)
                    }
                }
            }.apply()

            runOnUiThread {
                loadState()
                renderHeader()
                renderPunchUI()
            }
        }.start()
    }

    private fun showProcessing(show: Boolean) {
        isProcessing = show
        processingOverlay.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun formatMinutes(totalMin: Int): String {
        val h = totalMin / 60
        val m = totalMin % 60
        return String.format(Locale.ENGLISH, "%02d:%02d", h, m)
    }

    private fun formatTimeOrDash(ts: Long): String {
        if (ts <= 0L) return "--:--"
        val df = SimpleDateFormat("hh:mm a", Locale.ENGLISH)
        return df.format(Date(ts))
    }

    private fun getTodayKey(): Int {
        val cal = Calendar.getInstance()
        val y = cal.get(Calendar.YEAR)
        val m = cal.get(Calendar.MONTH) + 1
        val d = cal.get(Calendar.DAY_OF_MONTH)
        return y * 10000 + (m * 100) + d
    }

    private fun nowMinutesOfDay(): Int {
        val cal = Calendar.getInstance()
        return cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    }

    private fun formatMinuteToTime(mins: Int): String {
        val safe = if (mins < 0) 0 else mins
        val h = safe / 60
        val m = safe % 60
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, h)
        cal.set(Calendar.MINUTE, m)
        val df = SimpleDateFormat("hh:mm a", Locale.ENGLISH)
        return df.format(cal.time)
    }
}

data class PunchDecisionResult(
    val accepted: Boolean,
    val queuedOffline: Boolean = false,
    val pendingApproval: Boolean = false,
    val effectivePunchMs: Long? = null,
    val userMessage: String = "",
    val forceSummaryRefresh: Boolean = false
)





