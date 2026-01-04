package com.mucheng.notes.presentation.viewmodel;

import android.content.Context;
import com.mucheng.notes.domain.repository.ItemRepository;
import com.mucheng.notes.domain.repository.SyncRepository;
import com.mucheng.notes.security.CryptoEngine;
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
public final class NotesViewModel_Factory implements Factory<NotesViewModel> {
  private final Provider<Context> contextProvider;

  private final Provider<ItemRepository> itemRepositoryProvider;

  private final Provider<SyncRepository> syncRepositoryProvider;

  private final Provider<CryptoEngine> cryptoEngineProvider;

  public NotesViewModel_Factory(Provider<Context> contextProvider,
      Provider<ItemRepository> itemRepositoryProvider,
      Provider<SyncRepository> syncRepositoryProvider,
      Provider<CryptoEngine> cryptoEngineProvider) {
    this.contextProvider = contextProvider;
    this.itemRepositoryProvider = itemRepositoryProvider;
    this.syncRepositoryProvider = syncRepositoryProvider;
    this.cryptoEngineProvider = cryptoEngineProvider;
  }

  @Override
  public NotesViewModel get() {
    return newInstance(contextProvider.get(), itemRepositoryProvider.get(), syncRepositoryProvider.get(), cryptoEngineProvider.get());
  }

  public static NotesViewModel_Factory create(Provider<Context> contextProvider,
      Provider<ItemRepository> itemRepositoryProvider,
      Provider<SyncRepository> syncRepositoryProvider,
      Provider<CryptoEngine> cryptoEngineProvider) {
    return new NotesViewModel_Factory(contextProvider, itemRepositoryProvider, syncRepositoryProvider, cryptoEngineProvider);
  }

  public static NotesViewModel newInstance(Context context, ItemRepository itemRepository,
      SyncRepository syncRepository, CryptoEngine cryptoEngine) {
    return new NotesViewModel(context, itemRepository, syncRepository, cryptoEngine);
  }
}
