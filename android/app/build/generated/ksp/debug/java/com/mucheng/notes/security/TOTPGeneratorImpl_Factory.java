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
public final class TOTPGeneratorImpl_Factory implements Factory<TOTPGeneratorImpl> {
  @Override
  public TOTPGeneratorImpl get() {
    return newInstance();
  }

  public static TOTPGeneratorImpl_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static TOTPGeneratorImpl newInstance() {
    return new TOTPGeneratorImpl();
  }

  private static final class InstanceHolder {
    private static final TOTPGeneratorImpl_Factory INSTANCE = new TOTPGeneratorImpl_Factory();
  }
}
