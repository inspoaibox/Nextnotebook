package com.mucheng.notes.data.sync;

import com.mucheng.notes.data.local.dao.ItemDao;
import com.mucheng.notes.data.remote.WebDAVAdapter;
import com.mucheng.notes.security.CryptoEngine;
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
public final class SyncEngine_Factory implements Factory<SyncEngine> {
  private final Provider<WebDAVAdapter> webDAVAdapterProvider;

  private final Provider<ItemDao> itemDaoProvider;

  private final Provider<CryptoEngine> cryptoEngineProvider;

  public SyncEngine_Factory(Provider<WebDAVAdapter> webDAVAdapterProvider,
      Provider<ItemDao> itemDaoProvider, Provider<CryptoEngine> cryptoEngineProvider) {
    this.webDAVAdapterProvider = webDAVAdapterProvider;
    this.itemDaoProvider = itemDaoProvider;
    this.cryptoEngineProvider = cryptoEngineProvider;
  }

  @Override
  public SyncEngine get() {
    return newInstance(webDAVAdapterProvider.get(), itemDaoProvider.get(), cryptoEngineProvider.get());
  }

  public static SyncEngine_Factory create(Provider<WebDAVAdapter> webDAVAdapterProvider,
      Provider<ItemDao> itemDaoProvider, Provider<CryptoEngine> cryptoEngineProvider) {
    return new SyncEngine_Factory(webDAVAdapterProvider, itemDaoProvider, cryptoEngineProvider);
  }

  public static SyncEngine newInstance(WebDAVAdapter webDAVAdapter, ItemDao itemDao,
      CryptoEngine cryptoEngine) {
    return new SyncEngine(webDAVAdapter, itemDao, cryptoEngine);
  }
}
