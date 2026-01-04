package com.mucheng.notes.presentation.viewmodel;

import com.mucheng.notes.domain.repository.ItemRepository;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@ScopeMetadata
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
public final class TodosViewModel_Factory implements Factory<TodosViewModel> {
  private final Provider<ItemRepository> itemRepositoryProvider;

  public TodosViewModel_Factory(Provider<ItemRepository> itemRepositoryProvider) {
    this.itemRepositoryProvider = itemRepositoryProvider;
  }

  @Override
  public TodosViewModel get() {
    return newInstance(itemRepositoryProvider.get());
  }

  public static TodosViewModel_Factory create(Provider<ItemRepository> itemRepositoryProvider) {
    return new TodosViewModel_Factory(itemRepositoryProvider);
  }

  public static TodosViewModel newInstance(ItemRepository itemRepository) {
    return new TodosViewModel(itemRepository);
  }
}
