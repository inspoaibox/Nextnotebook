package com.mucheng.notes.presentation.viewmodel;

import com.mucheng.notes.domain.repository.ItemRepository;
import com.mucheng.notes.security.CryptoEngine;
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
public final class NoteDetailViewModel_Factory implements Factory<NoteDetailViewModel> {
  private final Provider<ItemRepository> itemRepositoryProvider;

  private final Provider<CryptoEngine> cryptoEngineProvider;

  public NoteDetailViewModel_Factory(Provider<ItemRepository> itemRepositoryProvider,
      Provider<CryptoEngine> cryptoEngineProvider) {
    this.itemRepositoryProvider = itemRepositoryProvider;
    this.cryptoEngineProvider = cryptoEngineProvider;
  }

  @Override
  public NoteDetailViewModel get() {
    return newInstance(itemRepositoryProvider.get(), cryptoEngineProvider.get());
  }

  public static NoteDetailViewModel_Factory create(Provider<ItemRepository> itemRepositoryProvider,
      Provider<CryptoEngine> cryptoEngineProvider) {
    return new NoteDetailViewModel_Factory(itemRepositoryProvider, cryptoEngineProvider);
  }

  public static NoteDetailViewModel newInstance(ItemRepository itemRepository,
      CryptoEngine cryptoEngine) {
    return new NoteDetailViewModel(itemRepository, cryptoEngine);
  }
}
