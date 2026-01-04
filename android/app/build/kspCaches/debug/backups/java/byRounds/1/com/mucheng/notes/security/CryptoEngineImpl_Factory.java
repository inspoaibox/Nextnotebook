package com.mucheng.notes.security;

import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

@ScopeMetadata("javax.inject.Singleton")
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
public final class CryptoEngineImpl_Factory implements Factory<CryptoEngineImpl> {
  @Override
  public CryptoEngineImpl get() {
    return newInstance();
  }

  public static CryptoEngineImpl_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static CryptoEngineImpl newInstance() {
    return new CryptoEngineImpl();
  }

  private static final class InstanceHolder {
    private static final CryptoEngineImpl_Factory INSTANCE = new CryptoEngineImpl_Factory();
  }
}
