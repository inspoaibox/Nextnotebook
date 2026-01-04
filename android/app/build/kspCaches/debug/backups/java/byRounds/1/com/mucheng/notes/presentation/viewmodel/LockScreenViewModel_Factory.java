package com.mucheng.notes.presentation.viewmodel;

import com.mucheng.notes.security.AppLockManager;
import com.mucheng.notes.security.BiometricManager;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata
@QualifierMetadata
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
public final class LockScreenViewModel_Factory implements Factory<LockScreenViewModel> {
  private final Provider<AppLockManager> appLockManagerProvider;

  private final Provider<BiometricManager> biometricManagerProvider;

  public LockScreenViewModel_Factory(Provider<AppLockManager> appLockManagerProvider,
      Provider<BiometricManager> biometricManagerProvider) {
    this.appLockManagerProvider = appLockManagerProvider;
    this.biometricManagerProvider = biometricManagerProvider;
  }

  @Override
  public LockScreenViewModel get() {
    return newInstance(appLockManagerProvider.get(), biometricManagerProvider.get());
  }

  public static LockScreenViewModel_Factory create(Provider<AppLockManager> appLockManagerProvider,
      Provider<BiometricManager> biometricManagerProvider) {
    return new LockScreenViewModel_Factory(appLockManagerProvider, biometricManagerProvider);
  }

  public static LockScreenViewModel newInstance(AppLockManager appLockManager,
      BiometricManager biometricManager) {
    return new LockScreenViewModel(appLockManager, biometricManager);
  }
}
