package com.mucheng.notes.presentation.navigation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.navArgument
import com.mucheng.notes.R
import com.mucheng.notes.presentation.screens.ai.AIScreen
import com.mucheng.notes.presentation.screens.bookmarks.BookmarksScreen
import com.mucheng.notes.presentation.screens.notes.NoteDetailScreen
import com.mucheng.notes.presentation.screens.notes.NotesScreen
import com.mucheng.notes.presentation.screens.settings.*
import com.mucheng.notes.presentation.screens.todos.TodosScreen
import com.mucheng.notes.presentation.screens.vault.VaultScreen
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel

/**
 * 导航路由
 */
sealed class Screen(
    val route: String,
    val titleResId: Int,
    val icon: ImageVector,
    val featureKey: String? = null
) {
    object Notes : Screen("notes", R.string.nav_notes, Icons.AutoMirrored.Filled.Notes)
    object NoteDetail : Screen("note/{noteId}?folderId={folderId}", R.string.nav_notes, Icons.AutoMirrored.Filled.Notes) {
        fun createRoute(noteId: String?, folderId: String? = null): String {
            val base = if (noteId != null) "note/$noteId" else "note/new"
            return if (folderId != null) "$base?folderId=$folderId" else base
        }
    }
    object Bookmarks : Screen("bookmarks", R.string.nav_bookmarks, Icons.Default.Bookmark, "bookmarks")
    object Todos : Screen("todos", R.string.nav_todos, Icons.Default.CheckCircle, "todos")
    object AI : Screen("ai", R.string.nav_ai, Icons.Default.SmartToy, "ai")
    object Vault : Screen("vault", R.string.nav_vault, Icons.Default.Lock, "vault")
    object Settings : Screen("settings", R.string.settings, Icons.Default.Settings)
}

/**
 * 底部导航项（不含设置，设置单独处理）
 */
val featureNavItems = listOf(
    Screen.Notes,
    Screen.Bookmarks,
    Screen.Todos,
    Screen.AI,
    Screen.Vault
)

/**
 * 需要显示底部导航的主页面路由
 */
private val mainScreenRoutes = listOf(
    Screen.Notes.route,
    Screen.Bookmarks.route,
    Screen.Todos.route,
    Screen.AI.route,
    Screen.Vault.route,
    Screen.Settings.route
)

/**
 * 主导航组件
 * @param settingsViewModel Activity 级别共享的 SettingsViewModel
 */
@Composable
fun MainNavigation(
    navController: NavHostController,
    settingsViewModel: SettingsViewModel
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val uiState by settingsViewModel.uiState.collectAsState()
    
    // 根据功能开关实时过滤底部导航项
    val enabledNavItems = featureNavItems.filter { screen ->
        when (screen.featureKey) {
            "bookmarks" -> uiState.bookmarksEnabled
            "todos" -> uiState.todosEnabled
            "ai" -> uiState.aiEnabled
            "vault" -> uiState.vaultEnabled
            else -> true
        }
    }
    
    // 判断当前是否在需要显示底部导航的页面
    val showBottomBar = currentDestination?.route in mainScreenRoutes
    
    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    // 功能模块导航项
                    enabledNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon, contentDescription = stringResource(screen.titleResId)) },
                            label = { Text(stringResource(screen.titleResId)) },
                            selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                    // 设置导航项（始终显示）
                    NavigationBarItem(
                        icon = { Icon(Screen.Settings.icon, contentDescription = stringResource(Screen.Settings.titleResId)) },
                        label = { Text(stringResource(Screen.Settings.titleResId)) },
                        selected = currentDestination?.route == Screen.Settings.route,
                        onClick = {
                            navController.navigate(Screen.Settings.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Screen.Notes.route,
            modifier = Modifier.fillMaxSize()
        ) {
            // 主页面
            composable(Screen.Notes.route) {
                NotesScreen(navController = navController, bottomPadding = paddingValues)
            }
            composable(
                route = Screen.NoteDetail.route,
                arguments = listOf(
                    navArgument("noteId") { 
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                    navArgument("folderId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    }
                )
            ) { backStackEntry ->
                val noteId = backStackEntry.arguments?.getString("noteId")
                val folderId = backStackEntry.arguments?.getString("folderId")
                NoteDetailScreen(
                    noteId = if (noteId == "new") null else noteId,
                    defaultFolderId = folderId,
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable(Screen.Bookmarks.route) {
                BookmarksScreen(navController = navController, bottomPadding = paddingValues)
            }
            composable(Screen.Todos.route) {
                TodosScreen(navController = navController, bottomPadding = paddingValues)
            }
            composable(Screen.AI.route) {
                AIScreen(
                    navController = navController, 
                    bottomPadding = paddingValues,
                    settingsViewModel = settingsViewModel
                )
            }
            composable(Screen.Vault.route) {
                VaultScreen(navController = navController, bottomPadding = paddingValues)
            }
            
            // 设置主页面
            composable(Screen.Settings.route) {
                SettingsScreen(
                    navController = navController,
                    bottomPadding = paddingValues,
                    viewModel = settingsViewModel
                )
            }
            
            // 设置子页面 - 传入共享的 SettingsViewModel
            composable("settings/features") {
                FeaturesSettingsScreen(
                    navController = navController,
                    viewModel = settingsViewModel
                )
            }
            composable("settings/sync") {
                SyncSettingsScreen(
                    navController = navController,
                    viewModel = settingsViewModel
                )
            }
            composable("settings/security") {
                SecuritySettingsScreen(
                    navController = navController,
                    viewModel = settingsViewModel
                )
            }
            composable("settings/ai") {
                AISettingsScreen(
                    navController = navController,
                    viewModel = settingsViewModel
                )
            }
            composable("settings/theme") {
                ThemeSettingsScreen(
                    navController = navController,
                    viewModel = settingsViewModel
                )
            }
            composable("settings/data") {
                DataSettingsScreen(
                    navController = navController,
                    viewModel = settingsViewModel
                )
            }
            composable("settings/about") {
                AboutScreen(navController = navController)
            }
        }
    }
}
