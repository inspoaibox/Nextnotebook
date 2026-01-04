package com.mucheng.notes.data.repository;

import com.mucheng.notes.data.local.dao.ItemDao;
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
public final class ItemRepositoryImpl_Factory implements Factory<ItemRepositoryImpl> {
  private final Provider<ItemDao> itemDaoProvider;

  public ItemRepositoryImpl_Factory(Provider<ItemDao> itemDaoProvider) {
    this.itemDaoProvider = itemDaoProvider;
  }

  @Override
  public ItemRepositoryImpl get() {
    return newInstance(itemDaoProvider.get());
  }

  public static ItemRepositoryImpl_Factory create(Provider<ItemDao> itemDaoProvider) {
    return new ItemRepositoryImpl_Factory(itemDaoProvider);
  }

  public static ItemRepositoryImpl newInstance(ItemDao itemDao) {
    return new ItemRepositoryImpl(itemDao);
  }
}
