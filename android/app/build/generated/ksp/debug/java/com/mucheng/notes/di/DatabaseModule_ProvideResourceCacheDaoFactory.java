package com.mucheng.notes.di;

import com.mucheng.notes.data.local.AppDatabase;
import com.mucheng.notes.data.local.dao.ResourceCacheDao;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
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
public final class DatabaseModule_ProvideResourceCacheDaoFactory implements Factory<ResourceCacheDao> {
  private final Provider<AppDatabase> databaseProvider;

  public DatabaseModule_ProvideResourceCacheDaoFactory(Provider<AppDatabase> databaseProvider) {
    this.databaseProvider = databaseProvider;
  }

  @Override
  public ResourceCacheDao get() {
    return provideResourceCacheDao(databaseProvider.get());
  }

  public static DatabaseModule_ProvideResourceCacheDaoFactory create(
      Provider<AppDatabase> databaseProvider) {
    return new DatabaseModule_ProvideResourceCacheDaoFactory(databaseProvider);
  }

  public static ResourceCacheDao provideResourceCacheDao(AppDatabase database) {
    return Preconditions.checkNotNullFromProvides(DatabaseModule.INSTANCE.provideResourceCacheDao(database));
  }
}
