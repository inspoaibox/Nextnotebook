package com.mucheng.notes.presentation.viewmodel;

import android.content.Context;
import com.mucheng.notes.domain.repository.ItemRepository;
import com.mucheng.notes.security.BiometricManager;
import com.mucheng.notes.security.CryptoEngine;
import com.mucheng.notes.security.TOTPGenerator;
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
public final class VaultViewModel_Factory implements Factory<VaultViewModel> {
  private final Provider<Context> contextProvider;

  private final Provider<ItemRepository> itemRepositoryProvider;

  private final Provider<TOTPGenerator> totpGeneratorProvider;

  private final Provider<BiometricManager> biometricManagerProvider;

  private final Provider<CryptoEngine> cryptoEngineProvider;

  public VaultViewModel_Factory(Provider<Context> contextProvider,
      Provider<ItemRepository> itemRepositoryProvider,
      Provider<TOTPGenerator> totpGeneratorProvider,
      Provider<BiometricManager> biometricManagerProvider,
      Provider<CryptoEngine> cryptoEngineProvider) {
    this.contextProvider = contextProvider;
    this.itemRepositoryProvider = itemRepositoryProvider;
    this.totpGeneratorProvider = totpGeneratorProvider;
    this.biometricManagerProvider = biometricManagerProvider;
    this.cryptoEngineProvider = cryptoEngineProvider;
  }

  @Override
  public VaultViewModel get() {
    return newInstance(contextProvider.get(), itemRepositoryProvider.get(), totpGeneratorProvider.get(), biometricManagerProvider.get(), cryptoEngineProvider.get());
  }

  public static VaultViewModel_Factory create(Provider<Context> contextProvider,
      Provider<ItemRepository> itemRepositoryProvider,
      Provider<TOTPGenerator> totpGeneratorProvider,
      Provider<BiometricManager> biometricManagerProvider,
      Provider<CryptoEngine> cryptoEngineProvider) {
    return new VaultViewModel_Factory(contextProvider, itemRepositoryProvider, totpGeneratorProvider, biometricManagerProvider, cryptoEngineProvider);
  }

  public static VaultViewModel newInstance(Context context, ItemRepository itemRepository,
      TOTPGenerator totpGenerator, BiometricManager biometricManager, CryptoEngine cryptoEngine) {
    return new VaultViewModel(context, itemRepository, totpGenerator, biometricManager, cryptoEngine);
  }
}
