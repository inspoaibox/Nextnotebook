package com.mucheng.notes.security

import java.util.concurrent.atomic.AtomicBoolean

/**
 * Tracks short-lived system activities that are launched from an unlocked app
 * flow, such as Android's file, folder, image, and camera pickers.
 */
object AppLockExternalActivityGuard {
    private val pendingBackgroundExemption = AtomicBoolean(false)
    private val awaitingReturn = AtomicBoolean(false)

    fun launchFromUnlockedApp(launch: () -> Unit) {
        pendingBackgroundExemption.set(true)
        awaitingReturn.set(true)
        try {
            launch()
        } catch (throwable: Throwable) {
            pendingBackgroundExemption.set(false)
            awaitingReturn.set(false)
            throw throwable
        }
    }

    fun shouldSkipBackgroundRecord(): Boolean {
        return pendingBackgroundExemption.compareAndSet(true, false)
    }

    fun isAwaitingReturn(): Boolean {
        return awaitingReturn.get()
    }

    fun consumeReturn(): Boolean {
        val returning = awaitingReturn.getAndSet(false)
        if (returning) {
            pendingBackgroundExemption.set(false)
        }
        return returning
    }
}
