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
public final class BiometricManagerImpl_Factory implements Factory<BiometricManagerImpl> {
  private final Provider<Context> contextProvider;

  public BiometricManagerImpl_Factory(Provider<Context> contextProvider) {
    this.contextProvider = contextProvider;
  }

  @Override
  public BiometricManagerImpl get() {
    return newInstance(contextProvider.get());
  }

  public static BiometricManagerImpl_Factory create(Provider<Context> contextProvider) {
    return new BiometricManagerImpl_Factory(contextProvider);
  }

  public static BiometricManagerImpl newInstance(Context context) {
    return new BiometricManagerImpl(context);
  }
}
