package com.mucheng.notes.presentation;

import com.mucheng.notes.security.AppLockManager;
import dagger.MembersInjector;
import dagger.internal.DaggerGenerated;
import dagger.internal.InjectedFieldSignature;
import dagger.internal.QualifierMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

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
public final class MainActivity_MembersInjector implements MembersInjector<MainActivity> {
  private final Provider<AppLockManager> appLockManagerProvider;

  public MainActivity_MembersInjector(Provider<AppLockManager> appLockManagerProvider) {
    this.appLockManagerProvider = appLockManagerProvider;
  }

  public static MembersInjector<MainActivity> create(
      Provider<AppLockManager> appLockManagerProvider) {
    return new MainActivity_MembersInjector(appLockManagerProvider);
  }

  @Override
  public void injectMembers(MainActivity instance) {
    injectAppLockManager(instance, appLockManagerProvider.get());
  }

  @InjectedFieldSignature("com.mucheng.notes.presentation.MainActivity.appLockManager")
  public static void injectAppLockManager(MainActivity instance, AppLockManager appLockManager) {
    instance.appLockManager = appLockManager;
  }
}
