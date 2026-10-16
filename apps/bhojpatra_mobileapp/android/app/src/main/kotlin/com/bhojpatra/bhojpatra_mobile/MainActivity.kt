package com.bhojpatra.bhojpatra_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.net.ConnectivityManager
import android.os.Build

class MainActivity : FlutterActivity() {
    private var permissionResult: MethodChannel.Result? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "bhojpatra/lan").setMethodCallHandler { call, result ->
            when (call.method) {
                "prepareDiscovery" -> {
                    if (Build.VERSION.SDK_INT >= 37 && applicationInfo.targetSdkVersion >= 37 && checkSelfPermission("android.permission.ACCESS_LOCAL_NETWORK") != PackageManager.PERMISSION_GRANTED) {
                        if (permissionResult != null) { result.success(false) } else {
                            permissionResult = result
                            requestPermissions(arrayOf("android.permission.ACCESS_LOCAL_NETWORK"), 3001)
                        }
                    } else { acquireMulticast(); result.success(true) }
                }
                "finishDiscovery" -> { releaseMulticast(); result.success(null) }
                "networkAddresses" -> {
                    val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                    val addresses = manager.allNetworks.flatMap { network ->
                        manager.getLinkProperties(network)?.linkAddresses?.map { it.address.hostAddress } ?: emptyList()
                    }
                    result.success(addresses)
                }
                else -> result.notImplemented()
            }
        }
    }
    private fun acquireMulticast() {
        if (multicastLock == null) {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            multicastLock = wifi.createMulticastLock("BhojPatra discovery").apply { setReferenceCounted(false); acquire() }
        }
    }
    private fun releaseMulticast() { multicastLock?.let { if (it.isHeld) it.release() }; multicastLock = null }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 3001) {
            val allowed = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            if (allowed) acquireMulticast()
            permissionResult?.success(allowed); permissionResult = null
        }
    }
    override fun onDestroy() { releaseMulticast(); super.onDestroy() }
}
