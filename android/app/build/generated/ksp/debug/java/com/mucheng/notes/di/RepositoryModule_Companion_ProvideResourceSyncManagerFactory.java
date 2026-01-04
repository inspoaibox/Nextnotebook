package com.mucheng.notes.di;

import android.content.Context;
import com.mucheng.notes.data.local.dao.ItemDao;
import com.mucheng.notes.data.local.dao.ResourceCacheDao;
import com.mucheng.notes.data.remote.WebDAVAdapter;
import com.mucheng.notes.data.sync.ResourceSyncManager;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
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
public final class RepositoryModule_Companion_ProvideResourceSyncManagerFactory implements Factory<ResourceSyncManager> {
  private final Provider<WebDAVAdapter> webDAVAdapterProvider;

  private final Provider<ItemDao> itemDaoProvider;

  private final Provider<ResourceCacheDao> resourceCacheDaoProvider;

  private final Provider<Context> contextProvider;

  public RepositoryModule_Companion_ProvideResourceSyncManagerFactory(
      Provider<WebDAVAdapter> webDAVAdapterProvider, Provider<ItemDao> itemDaoProvider,
      Provider<ResourceCacheDao> resourceCacheDaoProvider, Provider<Context> contextProvider) {
    this.webDAVAdapterProvider = webDAVAdapterProvider;
    this.itemDaoProvider = itemDaoProvider;
    this.resourceCacheDaoProvider = resourceCacheDaoProvider;
    this.contextProvider = contextProvider;
  }

  @Override
  public ResourceSyncManager get() {
    return provideResourceSyncManager(webDAVAdapterProvider.get(), itemDaoProvider.get(), resourceCacheDaoProvider.get(), contextProvider.get());
  }

  public static RepositoryModule_Companion_ProvideResourceSyncManagerFactory create(
      Provider<WebDAVAdapter> webDAVAdapterProvider, Provider<ItemDao> itemDaoProvider,
      Provider<ResourceCacheDao> resourceCacheDaoProvider, Provider<Context> contextProvider) {
    return new RepositoryModule_Companion_ProvideResourceSyncManagerFactory(webDAVAdapterProvider, itemDaoProvider, resourceCacheDaoProvider, contextProvider);
  }

  public static ResourceSyncManager provideResourceSyncManager(WebDAVAdapter webDAVAdapter,
      ItemDao itemDao, ResourceCacheDao resourceCacheDao, Context context) {
    return Preconditions.checkNotNullFromProvides(RepositoryModule.Companion.provideResourceSyncManager(webDAVAdapter, itemDao, resourceCacheDao, context));
  }
}
