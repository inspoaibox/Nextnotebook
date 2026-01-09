package com.mucheng.notes.data.sync;

import android.content.Context;
import com.mucheng.notes.data.local.dao.ItemDao;
import com.mucheng.notes.data.remote.WebDAVAdapter;
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
public final class SyncEngine_Factory implements Factory<SyncEngine> {
  private final Provider<WebDAVAdapter> webDAVAdapterProvider;

  private final Provider<ItemDao> itemDaoProvider;

  private final Provider<Context> contextProvider;

  public SyncEngine_Factory(Provider<WebDAVAdapter> webDAVAdapterProvider,
      Provider<ItemDao> itemDaoProvider, Provider<Context> contextProvider) {
    this.webDAVAdapterProvider = webDAVAdapterProvider;
    this.itemDaoProvider = itemDaoProvider;
    this.contextProvider = contextProvider;
  }

  @Override
  public SyncEngine get() {
    return newInstance(webDAVAdapterProvider.get(), itemDaoProvider.get(), contextProvider.get());
  }

  public static SyncEngine_Factory create(Provider<WebDAVAdapter> webDAVAdapterProvider,
      Provider<ItemDao> itemDaoProvider, Provider<Context> contextProvider) {
    return new SyncEngine_Factory(webDAVAdapterProvider, itemDaoProvider, contextProvider);
  }

  public static SyncEngine newInstance(WebDAVAdapter webDAVAdapter, ItemDao itemDao,
      Context context) {
    return new SyncEngine(webDAVAdapter, itemDao, context);
  }
}
