package com.mucheng.notes.data.sync;

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
public final class OfflineQueueManagerImpl_Factory implements Factory<OfflineQueueManagerImpl> {
  private final Provider<Context> contextProvider;

  public OfflineQueueManagerImpl_Factory(Provider<Context> contextProvider) {
    this.contextProvider = contextProvider;
  }

  @Override
  public OfflineQueueManagerImpl get() {
    return newInstance(contextProvider.get());
  }

  public static OfflineQueueManagerImpl_Factory create(Provider<Context> contextProvider) {
    return new OfflineQueueManagerImpl_Factory(contextProvider);
  }

  public static OfflineQueueManagerImpl newInstance(Context context) {
    return new OfflineQueueManagerImpl(context);
  }
}
