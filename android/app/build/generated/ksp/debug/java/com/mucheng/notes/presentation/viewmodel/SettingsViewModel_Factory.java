package com.mucheng.notes.presentation.viewmodel;

import android.content.Context;
import com.mucheng.notes.data.sync.SyncEngine;
import com.mucheng.notes.security.AppLockManager;
import com.mucheng.notes.security.BiometricManager;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata
@QualifierMetadata("dagger.hilt.android.qualifiers.ApplicationContext")
@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation"
})
public final class SettingsViewModel_Factory implements Factory<SettingsViewModel> {
  private final Provider<Context> contextProvider;

  private final Provider<AppLockManager> appLockManagerProvider;

  private final Provider<BiometricManager> biometricManagerProvider;

  private final Provider<SyncEngine> syncEngineProvider;

  public SettingsViewModel_Factory(Provider<Context> contextProvider,
      Provider<AppLockManager> appLockManagerProvider,
      Provider<BiometricManager> biometricManagerProvider,
      Provider<SyncEngine> syncEngineProvider) {
    this.contextProvider = contextProvider;
    this.appLockManagerProvider = appLockManagerProvider;
    this.biometricManagerProvider = biometricManagerProvider;
    this.syncEngineProvider = syncEngineProvider;
  }

  @Override
  public SettingsViewModel get() {
    return newInstance(contextProvider.get(), appLockManagerProvider.get(), biometricManagerProvider.get(), syncEngineProvider.get());
  }

  public static SettingsViewModel_Factory create(Provider<Context> contextProvider,
      Provider<AppLockManager> appLockManagerProvider,
      Provider<BiometricManager> biometricManagerProvider,
      Provider<SyncEngine> syncEngineProvider) {
    return new SettingsViewModel_Factory(contextProvider, appLockManagerProvider, biometricManagerProvider, syncEngineProvider);
  }

  public static SettingsViewModel newInstance(Context context, AppLockManager appLockManager,
      BiometricManager biometricManager, SyncEngine syncEngine) {
    return new SettingsViewModel(context, appLockManager, biometricManager, syncEngine);
  }
}
