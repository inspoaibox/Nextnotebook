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
public final class AIApiClient_Factory implements Factory<AIApiClient> {
  @Override
  public AIApiClient get() {
    return newInstance();
  }

  public static AIApiClient_Factory create() {
    return InstanceHolder.INSTANCE;
  }

  public static AIApiClient newInstance() {
    return new AIApiClient();
  }

  private static final class InstanceHolder {
    private static final AIApiClient_Factory INSTANCE = new AIApiClient_Factory();
  }
}
