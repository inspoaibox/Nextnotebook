package com.mucheng.notes.data.repository;

import com.mucheng.notes.data.sync.SyncEngine;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

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
public final class SyncRepositoryImpl_Factory implements Factory<SyncRepositoryImpl> {
  private final Provider<SyncEngine> syncEngineProvider;

  public SyncRepositoryImpl_Factory(Provider<SyncEngine> syncEngineProvider) {
    this.syncEngineProvider = syncEngineProvider;
  }

  @Override
  public SyncRepositoryImpl get() {
    return newInstance(syncEngineProvider.get());
  }

  public static SyncRepositoryImpl_Factory create(Provider<SyncEngine> syncEngineProvider) {
    return new SyncRepositoryImpl_Factory(syncEngineProvider);
  }

  public static SyncRepositoryImpl newInstance(SyncEngine syncEngine) {
    return new SyncRepositoryImpl(syncEngine);
  }
}
