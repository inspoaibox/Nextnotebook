package com.mucheng.notes;

import android.app.Activity;
import android.app.Service;
import android.view.View;
import androidx.fragment.app.Fragment;
import androidx.lifecycle.SavedStateHandle;
import androidx.lifecycle.ViewModel;
import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.mucheng.notes.data.local.AppDatabase;
import com.mucheng.notes.data.local.dao.ItemDao;
import com.mucheng.notes.data.remote.WebDAVAdapterImpl;
import com.mucheng.notes.data.repository.ItemRepositoryImpl;
import com.mucheng.notes.data.repository.SyncRepositoryImpl;
import com.mucheng.notes.data.sync.SyncEngine;
import com.mucheng.notes.di.DatabaseModule_ProvideAppDatabaseFactory;
import com.mucheng.notes.di.DatabaseModule_ProvideItemDaoFactory;
import com.mucheng.notes.presentation.MainActivity;
import com.mucheng.notes.presentation.MainActivity_MembersInjector;
import com.mucheng.notes.presentation.viewmodel.AIViewModel;
import com.mucheng.notes.presentation.viewmodel.AIViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.BookmarksViewModel;
import com.mucheng.notes.presentation.viewmodel.BookmarksViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.LockScreenViewModel;
import com.mucheng.notes.presentation.viewmodel.LockScreenViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel;
import com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.NotesViewModel;
import com.mucheng.notes.presentation.viewmodel.NotesViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel;
import com.mucheng.notes.presentation.viewmodel.SettingsViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.TodosViewModel;
import com.mucheng.notes.presentation.viewmodel.TodosViewModel_HiltModules;
import com.mucheng.notes.presentation.viewmodel.VaultViewModel;
import com.mucheng.notes.presentation.viewmodel.VaultViewModel_HiltModules;
import com.mucheng.notes.security.AppLockManagerImpl;
import com.mucheng.notes.security.BiometricManagerImpl;
import com.mucheng.notes.security.CryptoEngineImpl;
import com.mucheng.notes.security.TOTPGeneratorImpl;
import dagger.hilt.android.ActivityRetainedLifecycle;
import dagger.hilt.android.ViewModelLifecycle;
import dagger.hilt.android.internal.builders.ActivityComponentBuilder;
import dagger.hilt.android.internal.builders.ActivityRetainedComponentBuilder;
import dagger.hilt.android.internal.builders.FragmentComponentBuilder;
import dagger.hilt.android.internal.builders.ServiceComponentBuilder;
import dagger.hilt.android.internal.builders.ViewComponentBuilder;
import dagger.hilt.android.internal.builders.ViewModelComponentBuilder;
import dagger.hilt.android.internal.builders.ViewWithFragmentComponentBuilder;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories;
import dagger.hilt.android.internal.lifecycle.DefaultViewModelFactories_InternalFactoryFactory_Factory;
import dagger.hilt.android.internal.managers.ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory;
import dagger.hilt.android.internal.managers.SavedStateHandleHolder;
import dagger.hilt.android.internal.modules.ApplicationContextModule;
import dagger.hilt.android.internal.modules.ApplicationContextModule_ProvideContextFactory;
import dagger.internal.DaggerGenerated;
import dagger.internal.DoubleCheck;
import dagger.internal.IdentifierNameString;
import dagger.internal.KeepFieldType;
import dagger.internal.LazyClassKeyMap;
import dagger.internal.MapBuilder;
import dagger.internal.Preconditions;
import dagger.internal.Provider;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import javax.annotation.processing.Generated;

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
public final class DaggerMuchengNotesApp_HiltComponents_SingletonC {
  private DaggerMuchengNotesApp_HiltComponents_SingletonC() {
  }

  public static Builder builder() {
    return new Builder();
  }

  public static final class Builder {
    private ApplicationContextModule applicationContextModule;

    private Builder() {
    }

    public Builder applicationContextModule(ApplicationContextModule applicationContextModule) {
      this.applicationContextModule = Preconditions.checkNotNull(applicationContextModule);
      return this;
    }

    public MuchengNotesApp_HiltComponents.SingletonC build() {
      Preconditions.checkBuilderRequirement(applicationContextModule, ApplicationContextModule.class);
      return new SingletonCImpl(applicationContextModule);
    }
  }

  private static final class ActivityRetainedCBuilder implements MuchengNotesApp_HiltComponents.ActivityRetainedC.Builder {
    private final SingletonCImpl singletonCImpl;

    private SavedStateHandleHolder savedStateHandleHolder;

    private ActivityRetainedCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ActivityRetainedCBuilder savedStateHandleHolder(
        SavedStateHandleHolder savedStateHandleHolder) {
      this.savedStateHandleHolder = Preconditions.checkNotNull(savedStateHandleHolder);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.ActivityRetainedC build() {
      Preconditions.checkBuilderRequirement(savedStateHandleHolder, SavedStateHandleHolder.class);
      return new ActivityRetainedCImpl(singletonCImpl, savedStateHandleHolder);
    }
  }

  private static final class ActivityCBuilder implements MuchengNotesApp_HiltComponents.ActivityC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private Activity activity;

    private ActivityCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ActivityCBuilder activity(Activity activity) {
      this.activity = Preconditions.checkNotNull(activity);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.ActivityC build() {
      Preconditions.checkBuilderRequirement(activity, Activity.class);
      return new ActivityCImpl(singletonCImpl, activityRetainedCImpl, activity);
    }
  }

  private static final class FragmentCBuilder implements MuchengNotesApp_HiltComponents.FragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private Fragment fragment;

    private FragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public FragmentCBuilder fragment(Fragment fragment) {
      this.fragment = Preconditions.checkNotNull(fragment);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.FragmentC build() {
      Preconditions.checkBuilderRequirement(fragment, Fragment.class);
      return new FragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragment);
    }
  }

  private static final class ViewWithFragmentCBuilder implements MuchengNotesApp_HiltComponents.ViewWithFragmentC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private View view;

    private ViewWithFragmentCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;
    }

    @Override
    public ViewWithFragmentCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.ViewWithFragmentC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewWithFragmentCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl, view);
    }
  }

  private static final class ViewCBuilder implements MuchengNotesApp_HiltComponents.ViewC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private View view;

    private ViewCBuilder(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
    }

    @Override
    public ViewCBuilder view(View view) {
      this.view = Preconditions.checkNotNull(view);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.ViewC build() {
      Preconditions.checkBuilderRequirement(view, View.class);
      return new ViewCImpl(singletonCImpl, activityRetainedCImpl, activityCImpl, view);
    }
  }

  private static final class ViewModelCBuilder implements MuchengNotesApp_HiltComponents.ViewModelC.Builder {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private SavedStateHandle savedStateHandle;

    private ViewModelLifecycle viewModelLifecycle;

    private ViewModelCBuilder(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
    }

    @Override
    public ViewModelCBuilder savedStateHandle(SavedStateHandle handle) {
      this.savedStateHandle = Preconditions.checkNotNull(handle);
      return this;
    }

    @Override
    public ViewModelCBuilder viewModelLifecycle(ViewModelLifecycle viewModelLifecycle) {
      this.viewModelLifecycle = Preconditions.checkNotNull(viewModelLifecycle);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.ViewModelC build() {
      Preconditions.checkBuilderRequirement(savedStateHandle, SavedStateHandle.class);
      Preconditions.checkBuilderRequirement(viewModelLifecycle, ViewModelLifecycle.class);
      return new ViewModelCImpl(singletonCImpl, activityRetainedCImpl, savedStateHandle, viewModelLifecycle);
    }
  }

  private static final class ServiceCBuilder implements MuchengNotesApp_HiltComponents.ServiceC.Builder {
    private final SingletonCImpl singletonCImpl;

    private Service service;

    private ServiceCBuilder(SingletonCImpl singletonCImpl) {
      this.singletonCImpl = singletonCImpl;
    }

    @Override
    public ServiceCBuilder service(Service service) {
      this.service = Preconditions.checkNotNull(service);
      return this;
    }

    @Override
    public MuchengNotesApp_HiltComponents.ServiceC build() {
      Preconditions.checkBuilderRequirement(service, Service.class);
      return new ServiceCImpl(singletonCImpl, service);
    }
  }

  private static final class ViewWithFragmentCImpl extends MuchengNotesApp_HiltComponents.ViewWithFragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl;

    private final ViewWithFragmentCImpl viewWithFragmentCImpl = this;

    private ViewWithFragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        FragmentCImpl fragmentCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;
      this.fragmentCImpl = fragmentCImpl;


    }
  }

  private static final class FragmentCImpl extends MuchengNotesApp_HiltComponents.FragmentC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final FragmentCImpl fragmentCImpl = this;

    private FragmentCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, ActivityCImpl activityCImpl,
        Fragment fragmentParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return activityCImpl.getHiltInternalFactoryFactory();
    }

    @Override
    public ViewWithFragmentComponentBuilder viewWithFragmentComponentBuilder() {
      return new ViewWithFragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl, fragmentCImpl);
    }
  }

  private static final class ViewCImpl extends MuchengNotesApp_HiltComponents.ViewC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl;

    private final ViewCImpl viewCImpl = this;

    private ViewCImpl(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
        ActivityCImpl activityCImpl, View viewParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;
      this.activityCImpl = activityCImpl;


    }
  }

  private static final class ActivityCImpl extends MuchengNotesApp_HiltComponents.ActivityC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ActivityCImpl activityCImpl = this;

    private ActivityCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, Activity activityParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;


    }

    @Override
    public void injectMainActivity(MainActivity mainActivity) {
      injectMainActivity2(mainActivity);
    }

    @Override
    public DefaultViewModelFactories.InternalFactoryFactory getHiltInternalFactoryFactory() {
      return DefaultViewModelFactories_InternalFactoryFactory_Factory.newInstance(getViewModelKeys(), new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl));
    }

    @Override
    public Map<Class<?>, Boolean> getViewModelKeys() {
      return LazyClassKeyMap.<Boolean>of(MapBuilder.<String, Boolean>newMapBuilder(8).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_AIViewModel, AIViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_BookmarksViewModel, BookmarksViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_LockScreenViewModel, LockScreenViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_NoteDetailViewModel, NoteDetailViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_NotesViewModel, NotesViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_SettingsViewModel, SettingsViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_TodosViewModel, TodosViewModel_HiltModules.KeyModule.provide()).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_VaultViewModel, VaultViewModel_HiltModules.KeyModule.provide()).build());
    }

    @Override
    public ViewModelComponentBuilder getViewModelComponentBuilder() {
      return new ViewModelCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public FragmentComponentBuilder fragmentComponentBuilder() {
      return new FragmentCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @Override
    public ViewComponentBuilder viewComponentBuilder() {
      return new ViewCBuilder(singletonCImpl, activityRetainedCImpl, activityCImpl);
    }

    @CanIgnoreReturnValue
    private MainActivity injectMainActivity2(MainActivity instance) {
      MainActivity_MembersInjector.injectAppLockManager(instance, singletonCImpl.appLockManagerImplProvider.get());
      return instance;
    }

    @IdentifierNameString
    private static final class LazyClassKeyProvider {
      static String com_mucheng_notes_presentation_viewmodel_LockScreenViewModel = "com.mucheng.notes.presentation.viewmodel.LockScreenViewModel";

      static String com_mucheng_notes_presentation_viewmodel_BookmarksViewModel = "com.mucheng.notes.presentation.viewmodel.BookmarksViewModel";

      static String com_mucheng_notes_presentation_viewmodel_VaultViewModel = "com.mucheng.notes.presentation.viewmodel.VaultViewModel";

      static String com_mucheng_notes_presentation_viewmodel_AIViewModel = "com.mucheng.notes.presentation.viewmodel.AIViewModel";

      static String com_mucheng_notes_presentation_viewmodel_NotesViewModel = "com.mucheng.notes.presentation.viewmodel.NotesViewModel";

      static String com_mucheng_notes_presentation_viewmodel_SettingsViewModel = "com.mucheng.notes.presentation.viewmodel.SettingsViewModel";

      static String com_mucheng_notes_presentation_viewmodel_TodosViewModel = "com.mucheng.notes.presentation.viewmodel.TodosViewModel";

      static String com_mucheng_notes_presentation_viewmodel_NoteDetailViewModel = "com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel";

      @KeepFieldType
      LockScreenViewModel com_mucheng_notes_presentation_viewmodel_LockScreenViewModel2;

      @KeepFieldType
      BookmarksViewModel com_mucheng_notes_presentation_viewmodel_BookmarksViewModel2;

      @KeepFieldType
      VaultViewModel com_mucheng_notes_presentation_viewmodel_VaultViewModel2;

      @KeepFieldType
      AIViewModel com_mucheng_notes_presentation_viewmodel_AIViewModel2;

      @KeepFieldType
      NotesViewModel com_mucheng_notes_presentation_viewmodel_NotesViewModel2;

      @KeepFieldType
      SettingsViewModel com_mucheng_notes_presentation_viewmodel_SettingsViewModel2;

      @KeepFieldType
      TodosViewModel com_mucheng_notes_presentation_viewmodel_TodosViewModel2;

      @KeepFieldType
      NoteDetailViewModel com_mucheng_notes_presentation_viewmodel_NoteDetailViewModel2;
    }
  }

  private static final class ViewModelCImpl extends MuchengNotesApp_HiltComponents.ViewModelC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl;

    private final ViewModelCImpl viewModelCImpl = this;

    private Provider<AIViewModel> aIViewModelProvider;

    private Provider<BookmarksViewModel> bookmarksViewModelProvider;

    private Provider<LockScreenViewModel> lockScreenViewModelProvider;

    private Provider<NoteDetailViewModel> noteDetailViewModelProvider;

    private Provider<NotesViewModel> notesViewModelProvider;

    private Provider<SettingsViewModel> settingsViewModelProvider;

    private Provider<TodosViewModel> todosViewModelProvider;

    private Provider<VaultViewModel> vaultViewModelProvider;

    private ViewModelCImpl(SingletonCImpl singletonCImpl,
        ActivityRetainedCImpl activityRetainedCImpl, SavedStateHandle savedStateHandleParam,
        ViewModelLifecycle viewModelLifecycleParam) {
      this.singletonCImpl = singletonCImpl;
      this.activityRetainedCImpl = activityRetainedCImpl;

      initialize(savedStateHandleParam, viewModelLifecycleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandle savedStateHandleParam,
        final ViewModelLifecycle viewModelLifecycleParam) {
      this.aIViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 0);
      this.bookmarksViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 1);
      this.lockScreenViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 2);
      this.noteDetailViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 3);
      this.notesViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 4);
      this.settingsViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 5);
      this.todosViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 6);
      this.vaultViewModelProvider = new SwitchingProvider<>(singletonCImpl, activityRetainedCImpl, viewModelCImpl, 7);
    }

    @Override
    public Map<Class<?>, javax.inject.Provider<ViewModel>> getHiltViewModelMap() {
      return LazyClassKeyMap.<javax.inject.Provider<ViewModel>>of(MapBuilder.<String, javax.inject.Provider<ViewModel>>newMapBuilder(8).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_AIViewModel, ((Provider) aIViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_BookmarksViewModel, ((Provider) bookmarksViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_LockScreenViewModel, ((Provider) lockScreenViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_NoteDetailViewModel, ((Provider) noteDetailViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_NotesViewModel, ((Provider) notesViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_SettingsViewModel, ((Provider) settingsViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_TodosViewModel, ((Provider) todosViewModelProvider)).put(LazyClassKeyProvider.com_mucheng_notes_presentation_viewmodel_VaultViewModel, ((Provider) vaultViewModelProvider)).build());
    }

    @Override
    public Map<Class<?>, Object> getHiltViewModelAssistedMap() {
      return Collections.<Class<?>, Object>emptyMap();
    }

    @IdentifierNameString
    private static final class LazyClassKeyProvider {
      static String com_mucheng_notes_presentation_viewmodel_NotesViewModel = "com.mucheng.notes.presentation.viewmodel.NotesViewModel";

      static String com_mucheng_notes_presentation_viewmodel_AIViewModel = "com.mucheng.notes.presentation.viewmodel.AIViewModel";

      static String com_mucheng_notes_presentation_viewmodel_LockScreenViewModel = "com.mucheng.notes.presentation.viewmodel.LockScreenViewModel";

      static String com_mucheng_notes_presentation_viewmodel_VaultViewModel = "com.mucheng.notes.presentation.viewmodel.VaultViewModel";

      static String com_mucheng_notes_presentation_viewmodel_TodosViewModel = "com.mucheng.notes.presentation.viewmodel.TodosViewModel";

      static String com_mucheng_notes_presentation_viewmodel_NoteDetailViewModel = "com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel";

      static String com_mucheng_notes_presentation_viewmodel_BookmarksViewModel = "com.mucheng.notes.presentation.viewmodel.BookmarksViewModel";

      static String com_mucheng_notes_presentation_viewmodel_SettingsViewModel = "com.mucheng.notes.presentation.viewmodel.SettingsViewModel";

      @KeepFieldType
      NotesViewModel com_mucheng_notes_presentation_viewmodel_NotesViewModel2;

      @KeepFieldType
      AIViewModel com_mucheng_notes_presentation_viewmodel_AIViewModel2;

      @KeepFieldType
      LockScreenViewModel com_mucheng_notes_presentation_viewmodel_LockScreenViewModel2;

      @KeepFieldType
      VaultViewModel com_mucheng_notes_presentation_viewmodel_VaultViewModel2;

      @KeepFieldType
      TodosViewModel com_mucheng_notes_presentation_viewmodel_TodosViewModel2;

      @KeepFieldType
      NoteDetailViewModel com_mucheng_notes_presentation_viewmodel_NoteDetailViewModel2;

      @KeepFieldType
      BookmarksViewModel com_mucheng_notes_presentation_viewmodel_BookmarksViewModel2;

      @KeepFieldType
      SettingsViewModel com_mucheng_notes_presentation_viewmodel_SettingsViewModel2;
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final ViewModelCImpl viewModelCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          ViewModelCImpl viewModelCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.viewModelCImpl = viewModelCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // com.mucheng.notes.presentation.viewmodel.AIViewModel 
          return (T) new AIViewModel(singletonCImpl.itemRepositoryImplProvider.get());

          case 1: // com.mucheng.notes.presentation.viewmodel.BookmarksViewModel 
          return (T) new BookmarksViewModel(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.itemRepositoryImplProvider.get());

          case 2: // com.mucheng.notes.presentation.viewmodel.LockScreenViewModel 
          return (T) new LockScreenViewModel(singletonCImpl.appLockManagerImplProvider.get(), singletonCImpl.biometricManagerImplProvider.get());

          case 3: // com.mucheng.notes.presentation.viewmodel.NoteDetailViewModel 
          return (T) new NoteDetailViewModel(singletonCImpl.itemRepositoryImplProvider.get(), singletonCImpl.cryptoEngineImplProvider.get());

          case 4: // com.mucheng.notes.presentation.viewmodel.NotesViewModel 
          return (T) new NotesViewModel(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.itemRepositoryImplProvider.get(), singletonCImpl.syncRepositoryImplProvider.get(), singletonCImpl.cryptoEngineImplProvider.get());

          case 5: // com.mucheng.notes.presentation.viewmodel.SettingsViewModel 
          return (T) new SettingsViewModel(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.appLockManagerImplProvider.get(), singletonCImpl.biometricManagerImplProvider.get(), singletonCImpl.syncEngineProvider.get(), singletonCImpl.cryptoEngineImplProvider.get());

          case 6: // com.mucheng.notes.presentation.viewmodel.TodosViewModel 
          return (T) new TodosViewModel(singletonCImpl.itemRepositoryImplProvider.get());

          case 7: // com.mucheng.notes.presentation.viewmodel.VaultViewModel 
          return (T) new VaultViewModel(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule), singletonCImpl.itemRepositoryImplProvider.get(), singletonCImpl.tOTPGeneratorImplProvider.get(), singletonCImpl.biometricManagerImplProvider.get(), singletonCImpl.cryptoEngineImplProvider.get());

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ActivityRetainedCImpl extends MuchengNotesApp_HiltComponents.ActivityRetainedC {
    private final SingletonCImpl singletonCImpl;

    private final ActivityRetainedCImpl activityRetainedCImpl = this;

    private Provider<ActivityRetainedLifecycle> provideActivityRetainedLifecycleProvider;

    private ActivityRetainedCImpl(SingletonCImpl singletonCImpl,
        SavedStateHandleHolder savedStateHandleHolderParam) {
      this.singletonCImpl = singletonCImpl;

      initialize(savedStateHandleHolderParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final SavedStateHandleHolder savedStateHandleHolderParam) {
      this.provideActivityRetainedLifecycleProvider = DoubleCheck.provider(new SwitchingProvider<ActivityRetainedLifecycle>(singletonCImpl, activityRetainedCImpl, 0));
    }

    @Override
    public ActivityComponentBuilder activityComponentBuilder() {
      return new ActivityCBuilder(singletonCImpl, activityRetainedCImpl);
    }

    @Override
    public ActivityRetainedLifecycle getActivityRetainedLifecycle() {
      return provideActivityRetainedLifecycleProvider.get();
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final ActivityRetainedCImpl activityRetainedCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, ActivityRetainedCImpl activityRetainedCImpl,
          int id) {
        this.singletonCImpl = singletonCImpl;
        this.activityRetainedCImpl = activityRetainedCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // dagger.hilt.android.ActivityRetainedLifecycle 
          return (T) ActivityRetainedComponentManager_LifecycleModule_ProvideActivityRetainedLifecycleFactory.provideActivityRetainedLifecycle();

          default: throw new AssertionError(id);
        }
      }
    }
  }

  private static final class ServiceCImpl extends MuchengNotesApp_HiltComponents.ServiceC {
    private final SingletonCImpl singletonCImpl;

    private final ServiceCImpl serviceCImpl = this;

    private ServiceCImpl(SingletonCImpl singletonCImpl, Service serviceParam) {
      this.singletonCImpl = singletonCImpl;


    }
  }

  private static final class SingletonCImpl extends MuchengNotesApp_HiltComponents.SingletonC {
    private final ApplicationContextModule applicationContextModule;

    private final SingletonCImpl singletonCImpl = this;

    private Provider<AppLockManagerImpl> appLockManagerImplProvider;

    private Provider<AppDatabase> provideAppDatabaseProvider;

    private Provider<ItemDao> provideItemDaoProvider;

    private Provider<ItemRepositoryImpl> itemRepositoryImplProvider;

    private Provider<BiometricManagerImpl> biometricManagerImplProvider;

    private Provider<CryptoEngineImpl> cryptoEngineImplProvider;

    private Provider<WebDAVAdapterImpl> webDAVAdapterImplProvider;

    private Provider<SyncEngine> syncEngineProvider;

    private Provider<SyncRepositoryImpl> syncRepositoryImplProvider;

    private Provider<TOTPGeneratorImpl> tOTPGeneratorImplProvider;

    private SingletonCImpl(ApplicationContextModule applicationContextModuleParam) {
      this.applicationContextModule = applicationContextModuleParam;
      initialize(applicationContextModuleParam);

    }

    @SuppressWarnings("unchecked")
    private void initialize(final ApplicationContextModule applicationContextModuleParam) {
      this.appLockManagerImplProvider = DoubleCheck.provider(new SwitchingProvider<AppLockManagerImpl>(singletonCImpl, 0));
      this.provideAppDatabaseProvider = DoubleCheck.provider(new SwitchingProvider<AppDatabase>(singletonCImpl, 3));
      this.provideItemDaoProvider = DoubleCheck.provider(new SwitchingProvider<ItemDao>(singletonCImpl, 2));
      this.itemRepositoryImplProvider = DoubleCheck.provider(new SwitchingProvider<ItemRepositoryImpl>(singletonCImpl, 1));
      this.biometricManagerImplProvider = DoubleCheck.provider(new SwitchingProvider<BiometricManagerImpl>(singletonCImpl, 4));
      this.cryptoEngineImplProvider = DoubleCheck.provider(new SwitchingProvider<CryptoEngineImpl>(singletonCImpl, 5));
      this.webDAVAdapterImplProvider = DoubleCheck.provider(new SwitchingProvider<WebDAVAdapterImpl>(singletonCImpl, 8));
      this.syncEngineProvider = DoubleCheck.provider(new SwitchingProvider<SyncEngine>(singletonCImpl, 7));
      this.syncRepositoryImplProvider = DoubleCheck.provider(new SwitchingProvider<SyncRepositoryImpl>(singletonCImpl, 6));
      this.tOTPGeneratorImplProvider = DoubleCheck.provider(new SwitchingProvider<TOTPGeneratorImpl>(singletonCImpl, 9));
    }

    @Override
    public void injectMuchengNotesApp(MuchengNotesApp muchengNotesApp) {
    }

    @Override
    public Set<Boolean> getDisableFragmentGetContextFix() {
      return Collections.<Boolean>emptySet();
    }

    @Override
    public ActivityRetainedComponentBuilder retainedComponentBuilder() {
      return new ActivityRetainedCBuilder(singletonCImpl);
    }

    @Override
    public ServiceComponentBuilder serviceComponentBuilder() {
      return new ServiceCBuilder(singletonCImpl);
    }

    private static final class SwitchingProvider<T> implements Provider<T> {
      private final SingletonCImpl singletonCImpl;

      private final int id;

      SwitchingProvider(SingletonCImpl singletonCImpl, int id) {
        this.singletonCImpl = singletonCImpl;
        this.id = id;
      }

      @SuppressWarnings("unchecked")
      @Override
      public T get() {
        switch (id) {
          case 0: // com.mucheng.notes.security.AppLockManagerImpl 
          return (T) new AppLockManagerImpl(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 1: // com.mucheng.notes.data.repository.ItemRepositoryImpl 
          return (T) new ItemRepositoryImpl(singletonCImpl.provideItemDaoProvider.get());

          case 2: // com.mucheng.notes.data.local.dao.ItemDao 
          return (T) DatabaseModule_ProvideItemDaoFactory.provideItemDao(singletonCImpl.provideAppDatabaseProvider.get());

          case 3: // com.mucheng.notes.data.local.AppDatabase 
          return (T) DatabaseModule_ProvideAppDatabaseFactory.provideAppDatabase(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 4: // com.mucheng.notes.security.BiometricManagerImpl 
          return (T) new BiometricManagerImpl(ApplicationContextModule_ProvideContextFactory.provideContext(singletonCImpl.applicationContextModule));

          case 5: // com.mucheng.notes.security.CryptoEngineImpl 
          return (T) new CryptoEngineImpl();

          case 6: // com.mucheng.notes.data.repository.SyncRepositoryImpl 
          return (T) new SyncRepositoryImpl(singletonCImpl.syncEngineProvider.get());

          case 7: // com.mucheng.notes.data.sync.SyncEngine 
          return (T) new SyncEngine(singletonCImpl.webDAVAdapterImplProvider.get(), singletonCImpl.provideItemDaoProvider.get(), singletonCImpl.cryptoEngineImplProvider.get());

          case 8: // com.mucheng.notes.data.remote.WebDAVAdapterImpl 
          return (T) new WebDAVAdapterImpl();

          case 9: // com.mucheng.notes.security.TOTPGeneratorImpl 
          return (T) new TOTPGeneratorImpl();

          default: throw new AssertionError(id);
        }
      }
    }
  }
}
