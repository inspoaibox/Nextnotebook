package com.mucheng.notes.presentation.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// 暮城笔记主题色
private val MuchengPrimary = Color(0xFF6750A4)
private val MuchengOnPrimary = Color(0xFFFFFFFF)
private val MuchengPrimaryContainer = Color(0xFFEADDFF)
private val MuchengOnPrimaryContainer = Color(0xFF21005D)

private val MuchengSecondary = Color(0xFF625B71)
private val MuchengOnSecondary = Color(0xFFFFFFFF)
private val MuchengSecondaryContainer = Color(0xFFE8DEF8)
private val MuchengOnSecondaryContainer = Color(0xFF1D192B)

private val MuchengTertiary = Color(0xFF7D5260)
private val MuchengOnTertiary = Color(0xFFFFFFFF)
private val MuchengTertiaryContainer = Color(0xFFFFD8E4)
private val MuchengOnTertiaryContainer = Color(0xFF31111D)

private val MuchengError = Color(0xFFB3261E)
private val MuchengOnError = Color(0xFFFFFFFF)
private val MuchengErrorContainer = Color(0xFFF9DEDC)
private val MuchengOnErrorContainer = Color(0xFF410E0B)

private val MuchengBackground = Color(0xFFFFFBFE)
private val MuchengOnBackground = Color(0xFF1C1B1F)
private val MuchengSurface = Color(0xFFFFFBFE)
private val MuchengOnSurface = Color(0xFF1C1B1F)

private val MuchengDarkPrimary = Color(0xFFD0BCFF)
private val MuchengDarkOnPrimary = Color(0xFF381E72)
private val MuchengDarkPrimaryContainer = Color(0xFF4F378B)
private val MuchengDarkOnPrimaryContainer = Color(0xFFEADDFF)

private val MuchengDarkSecondary = Color(0xFFCCC2DC)
private val MuchengDarkOnSecondary = Color(0xFF332D41)
private val MuchengDarkSecondaryContainer = Color(0xFF4A4458)
private val MuchengDarkOnSecondaryContainer = Color(0xFFE8DEF8)

private val MuchengDarkTertiary = Color(0xFFEFB8C8)
private val MuchengDarkOnTertiary = Color(0xFF492532)
private val MuchengDarkTertiaryContainer = Color(0xFF633B48)
private val MuchengDarkOnTertiaryContainer = Color(0xFFFFD8E4)

private val MuchengDarkError = Color(0xFFF2B8B5)
private val MuchengDarkOnError = Color(0xFF601410)
private val MuchengDarkErrorContainer = Color(0xFF8C1D18)
private val MuchengDarkOnErrorContainer = Color(0xFFF9DEDC)

private val MuchengDarkBackground = Color(0xFF1C1B1F)
private val MuchengDarkOnBackground = Color(0xFFE6E1E5)
private val MuchengDarkSurface = Color(0xFF1C1B1F)
private val MuchengDarkOnSurface = Color(0xFFE6E1E5)

private val LightColorScheme = lightColorScheme(
    primary = MuchengPrimary,
    onPrimary = MuchengOnPrimary,
    primaryContainer = MuchengPrimaryContainer,
    onPrimaryContainer = MuchengOnPrimaryContainer,
    secondary = MuchengSecondary,
    onSecondary = MuchengOnSecondary,
    secondaryContainer = MuchengSecondaryContainer,
    onSecondaryContainer = MuchengOnSecondaryContainer,
    tertiary = MuchengTertiary,
    onTertiary = MuchengOnTertiary,
    tertiaryContainer = MuchengTertiaryContainer,
    onTertiaryContainer = MuchengOnTertiaryContainer,
    error = MuchengError,
    onError = MuchengOnError,
    errorContainer = MuchengErrorContainer,
    onErrorContainer = MuchengOnErrorContainer,
    background = MuchengBackground,
    onBackground = MuchengOnBackground,
    surface = MuchengSurface,
    onSurface = MuchengOnSurface
)

private val DarkColorScheme = darkColorScheme(
    primary = MuchengDarkPrimary,
    onPrimary = MuchengDarkOnPrimary,
    primaryContainer = MuchengDarkPrimaryContainer,
    onPrimaryContainer = MuchengDarkOnPrimaryContainer,
    secondary = MuchengDarkSecondary,
    onSecondary = MuchengDarkOnSecondary,
    secondaryContainer = MuchengDarkSecondaryContainer,
    onSecondaryContainer = MuchengDarkOnSecondaryContainer,
    tertiary = MuchengDarkTertiary,
    onTertiary = MuchengDarkOnTertiary,
    tertiaryContainer = MuchengDarkTertiaryContainer,
    onTertiaryContainer = MuchengDarkOnTertiaryContainer,
    error = MuchengDarkError,
    onError = MuchengDarkOnError,
    errorContainer = MuchengDarkErrorContainer,
    onErrorContainer = MuchengDarkOnErrorContainer,
    background = MuchengDarkBackground,
    onBackground = MuchengDarkOnBackground,
    surface = MuchengDarkSurface,
    onSurface = MuchengDarkOnSurface
)

@Composable
fun MuchengNotesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
