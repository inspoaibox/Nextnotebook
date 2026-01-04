package com.mucheng.notes.security;

import android.content.Context;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata("javax.inject.Singleton")
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
public final class AppLockManagerImpl_Factory implements Factory<AppLockManagerImpl> {
  private final Provider<Context> contextProvider;

  public AppLockManagerImpl_Factory(Provider<Context> contextProvider) {
    this.contextProvider = contextProvider;
  }

  @Override
  public AppLockManagerImpl get() {
    return newInstance(contextProvider.get());
  }

  public static AppLockManagerImpl_Factory create(Provider<Context> contextProvider) {
    return new AppLockManagerImpl_Factory(contextProvider);
  }

  public static AppLockManagerImpl newInstance(Context context) {
    return new AppLockManagerImpl(context);
  }
}
