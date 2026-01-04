package com.mucheng.notes.presentation.viewmodel;

import android.content.Context;
import com.mucheng.notes.domain.repository.ItemRepository;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata
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
public final class BookmarksViewModel_Factory implements Factory<BookmarksViewModel> {
  private final Provider<Context> contextProvider;

  private final Provider<ItemRepository> itemRepositoryProvider;

  public BookmarksViewModel_Factory(Provider<Context> contextProvider,
      Provider<ItemRepository> itemRepositoryProvider) {
    this.contextProvider = contextProvider;
    this.itemRepositoryProvider = itemRepositoryProvider;
  }

  @Override
  public BookmarksViewModel get() {
    return newInstance(contextProvider.get(), itemRepositoryProvider.get());
  }

  public static BookmarksViewModel_Factory create(Provider<Context> contextProvider,
      Provider<ItemRepository> itemRepositoryProvider) {
    return new BookmarksViewModel_Factory(contextProvider, itemRepositoryProvider);
  }

  public static BookmarksViewModel newInstance(Context context, ItemRepository itemRepository) {
    return new BookmarksViewModel(context, itemRepository);
  }
}
