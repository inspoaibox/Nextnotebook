package com.mucheng.notes.data.sync;

import com.mucheng.notes.data.local.dao.ItemDao;
import com.mucheng.notes.data.local.dao.ResourceCacheDao;
import com.mucheng.notes.data.remote.WebDAVAdapter;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import java.io.File;
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
public final class ResourceSyncManager_Factory implements Factory<ResourceSyncManager> {
  private final Provider<WebDAVAdapter> webDAVAdapterProvider;

  private final Provider<ItemDao> itemDaoProvider;

  private final Provider<ResourceCacheDao> resourceCacheDaoProvider;

  private final Provider<File> cacheDirProvider;

  public ResourceSyncManager_Factory(Provider<WebDAVAdapter> webDAVAdapterProvider,
      Provider<ItemDao> itemDaoProvider, Provider<ResourceCacheDao> resourceCacheDaoProvider,
      Provider<File> cacheDirProvider) {
    this.webDAVAdapterProvider = webDAVAdapterProvider;
    this.itemDaoProvider = itemDaoProvider;
    this.resourceCacheDaoProvider = resourceCacheDaoProvider;
    this.cacheDirProvider = cacheDirProvider;
  }

  @Override
  public ResourceSyncManager get() {
    return newInstance(webDAVAdapterProvider.get(), itemDaoProvider.get(), resourceCacheDaoProvider.get(), cacheDirProvider.get());
  }

  public static ResourceSyncManager_Factory create(Provider<WebDAVAdapter> webDAVAdapterProvider,
      Provider<ItemDao> itemDaoProvider, Provider<ResourceCacheDao> resourceCacheDaoProvider,
      Provider<File> cacheDirProvider) {
    return new ResourceSyncManager_Factory(webDAVAdapterProvider, itemDaoProvider, resourceCacheDaoProvider, cacheDirProvider);
  }

  public static ResourceSyncManager newInstance(WebDAVAdapter webDAVAdapter, ItemDao itemDao,
      ResourceCacheDao resourceCacheDao, File cacheDir) {
    return new ResourceSyncManager(webDAVAdapter, itemDao, resourceCacheDao, cacheDir);
  }
}
