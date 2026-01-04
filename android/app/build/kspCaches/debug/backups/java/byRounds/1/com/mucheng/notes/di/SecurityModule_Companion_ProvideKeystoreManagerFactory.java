package com.mucheng.notes.di;

import com.mucheng.notes.security.KeystoreManager;
import dagger.internal.DaggerGenerated;
import dagger.internal.Factory;
import dagger.internal.Preconditions;
import dagger.internal.QualifierMetadata;
import dagger.internal.ScopeMetadata;
import javax.annotation.processing.Generated;

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
public final class SecurityModule_Companion_ProvideKeystoreManagerFactory implements Factory<KeystoreManager> {
  @Override
  public KeystoreManager get() {
    return provideKeystoreManager();
  }

  public static SecurityModule_Companion_ProvideKeystoreManagerFactory create() {
    return InstanceHolder.INSTANCE;
  }

  public static KeystoreManager provideKeystoreManager() {
    return Preconditions.checkNotNullFromProvides(SecurityModule.Companion.provideKeystoreManager());
  }

  private static final class InstanceHolder {
    private static final SecurityModule_Companion_ProvideKeystoreManagerFactory INSTANCE = new SecurityModule_Companion_ProvideKeystoreManagerFactory();
  }
}
