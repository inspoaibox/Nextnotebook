package com.mucheng.notes.data.remote;

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
public final class WebDAVAdapterImpl_Factory implements Factory<WebDAVAdapterImpl> {
  @Override
  public WebDAVAdapterImpl get() {
    return newInstance();
  }

  public static WebDAVAdapterImpl_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static WebDAVAdapterImpl newInstance() {
    return new WebDAVAdapterImpl();
  }

  private static final class InstanceHolder {
    private static final WebDAVAdapterImpl_Factory INSTANCE = new WebDAVAdapterImpl_Factory();
  }
}
