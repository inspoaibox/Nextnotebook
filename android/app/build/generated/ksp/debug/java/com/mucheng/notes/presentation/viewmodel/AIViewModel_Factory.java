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
public final class AIViewModel_Factory implements Factory<AIViewModel> {
  private final Provider<ItemRepository> itemRepositoryProvider;

  public AIViewModel_Factory(Provider<ItemRepository> itemRepositoryProvider) {
    this.itemRepositoryProvider = itemRepositoryProvider;
  }

  @Override
  public AIViewModel get() {
    return newInstance(itemRepositoryProvider.get());
  }

  public static AIViewModel_Factory create(Provider<ItemRepository> itemRepositoryProvider) {
    return new AIViewModel_Factory(itemRepositoryProvider);
  }

  public static AIViewModel newInstance(ItemRepository itemRepository) {
    return new AIViewModel(itemRepository);
  }
}
