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
public final class NetworkSecurityManagerImpl_Factory implements Factory<NetworkSecurityManagerImpl> {
  @Override
  public NetworkSecurityManagerImpl get() {
    return newInstance();
  }

  public static NetworkSecurityManagerImpl_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static NetworkSecurityManagerImpl newInstance() {
    return new NetworkSecurityManagerImpl();
  }

  private static final class InstanceHolder {
    private static final NetworkSecurityManagerImpl_Factory INSTANCE = new NetworkSecurityManagerImpl_Factory();
  }
}
