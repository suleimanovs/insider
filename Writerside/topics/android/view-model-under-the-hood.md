# ViewModel Under The Hood: View Model Store

## Введение

В статье не рассматривается работа с ViewModel, предполагается, что эта тема уже знакома. Основное внимание уделяется
тому, как ViewModel переживает изменение конфигурации. Но для начала — небольшое введение в ViewModel.

**ViewModel** - компонент архитектурного паттерна MVVM, который был предоставлен Google как примитив
позволяющий пережить изменение конфигураций. Изменение конфигураций в свою очередь - это состояние, заставляющая
activity/fragment пересоздаваться, это именно то состояние которое может пережить ViewModel.
Популярные конфигурации которые приводят к пересозданию Activity:

1. Изменение ориентаций экрана(screenOrientation): portrait/landscape
2. Изменение направления экрана(layoutDirection): rtl/ltr
3. Изменение языка приложения(locale)
4. Изменение размера шрифтов/соотношение экрана

Есть конечно способ сообщать системе о том что пересоздавать Activity при изменении конфигураций не нужно.
Флаг android:configChanges используется в AndroidManifest.xml в теге activity, чтобы указать, какие изменения
конфигурации система не должна пересоздавать Activity, а передавать управление в Activity.onConfigurationChanged().

```xml

<activity
        android:name="MainActivity"
        android:configChanges="touchscreen|keyboard|keyboardHidden|navigation|screenLayout|mcc|mnc|locale|fontScale|uiMode|screenSize|smallestScreenSize|density|orientation"
/>
```

Но речь сейчас так же не об этом, так как наша цель рассмотреть каким чудом ViewModel может пережить изменение
всех конфигурационных состояний выше.

## Объявление ViewModel

C появлением Kotlin делегатов мы сильно обленились и теперь обь являем ViewModel вот таким образом с использованием
kotlin delegates:

```kotlin
class MainActivity : ComponentActivity() {

    private val viewModel by viewModel<MyViewModel>()
}

```

Без делегатов создание объекта ViewModel используя явно ViewModelProvider:

[//]: # (<tabs>)

[//]: # (<tab title="2.7.0 и ниже">)

[//]: # ()

[//]: # ()

[//]: # (</tab>)

[//]: # (<tab title="2.8.0 и выше">)

[//]: # (</tab>)

[//]: # (</tabs>)

```kotlin
class MainActivity : ComponentActivity() {

    private lateinit var viewModel: MyViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // В старых версиях ViewModelProvider был частью lifecycle-viewmodel
        viewModel = ViewModelProvider(this).get(MyViewModel::class.java)

        // После адаптации ViewModel под KMP и переноса ViewModelProvider в lifecycle-viewmodel-android 
        // можно и рекомендуется через фабричный метод create:
        viewModel = ViewModelProvider.create(owner = this).get(MyViewModel::class.java)

        // Альтернативный способ создания ViewModel (эквивалентен предыдущему)
        viewModel = ViewModelProvider.create(store = this.viewModelStore).get(MyViewModel::class.java)
    }
}
```

<note>

**Jetpack ViewModel** теперь поддерживает **Kotlin Multiplatform (KMP)**, что позволяет использовать его
не только на Android, но и на iOS, Desktop и Web. Это стало возможным благодаря разделению на два модуля:

**lifecycle-viewmodel(expected):** KMP-модуль без привязки к Android.
**lifecycle-viewmodel-android(actual):** модуль для работы с ViewModelStoreOwner и ViewModelProvider на Android.

Начиная с версии **2.8.0-alpha03**, артефакты **lifecycle-*** теперь официально поддерживают Kotlin Multiplatform!
Это означает, что классы, такие как ViewModel, ViewModelStore, ViewModelStoreOwner и ViewModelProvider,
теперь можно использовать в общем коде.
</note>

<tip>
Далее в статье мы рассмотрим именно версию viewmodel:2.8.0+, если в версий на которой вы находитесь сейчас
немного отличаются исходники, то не переживайте, c добавлением поддержки kmp немного поменяли внутренюю  структуру ,
но реализация и внутренняя логика такая же что и до поддержки kmp
</tip>



Как мы видим выше, мы в ручную не создаем объект ViewModel, а только передаем тип его класса в ViewModelProvider,
и его созданием лично занимается сам ViewModelProvider. Обратите внимание, что мы так же передаем в метод
`ViewModelProvider.create` поле `owner = this`, если провалиться в исходники метода create, то можно заметить
что требуется тип owner : ViewModelStoreOwner:

```kotlin
public actual companion object {

    @JvmStatic
    @Suppress("MissingJvmstatic")
    public actual fun create(
        owner: ViewModelStoreOwner, // <- нас интересует этот тип
        factory: Factory,
        extras: CreationExtras,
    ): ViewModelProvider = ViewModelProvider(owner.viewModelStore, factory, extras)
}
```

<tip>
Если интересно, почему метод `create()` можно вызывать без передачи значений для параметров `factory` и `extras` (хоть они и обязательны):

```kotlin
ViewModelProvider.create(owner = this)
```

Это связано с тем, что код использует KMP (Kotlin Multiplatform). В expect-объявлении для create() уже заданы значения
по умолчанию для factory и extras, поэтому передавать их явно необязательно.

Подробнее можно посмотреть в исходниках:
[ViewModelProvider.kt](https://github.com/androidx/androidx/blob/androidx-main/lifecycle/lifecycle-viewmodel/src/commonMain/kotlin/androidx/lifecycle/ViewModelProvider.kt)
</tip>

## Углубляемся в ViewModelStore / Owner
Получается что при вызове метода ViewModelProvider.create() для параметра owner мы передаем this(само активити), и как
можно
догадаться это означает что активити наследуется от этого типа ViewModelStoreOwner, давайте глянем исходники этого
[ViewModelStoreOwner](https://github.com/androidx/androidx/blob/androidx-main/lifecycle/lifecycle-viewmodel/src/commonMain/kotlin/androidx/lifecycle/ViewModelStoreOwner.kt):

```kotlin
public interface ViewModelStoreOwner {

    /**
     * The owned [ViewModelStore]
     */
    public val viewModelStore: ViewModelStore
}
```

ViewModelStoreOwner - интерфейс у которого есть одно поле, который является ViewModelStore(хранителем view models), от
ViewModelStoreOwner наследуются такие компоненты как: **ComponentActivity**, **Fragment**, **NavBackStackEntry**

ViewModelStoreOwner(в лице ComponentActivity/Fragment) - занимается двумя обьязанностями:

1. Хранение ViewModelStore во время изменения конфигураций
2. Очистка ViewModelStore когда умирает, в состояний Lifecycle.onDestroy()

Дальше нас уже интересует сам ViewModelStore. ViewModelStore - это класс который внутри себя делегирует работу HashMap:

```kotlin
private val map = mutableMapOf<String, ViewModel>()
```

Соответсвенно ViewModelStore так же делегирует методы put, get, key, clear внутреннему HashMap-у, но особого внимания
стоит метод clear:

````kotlin
public open class ViewModelStore {

    private val map = mutableMapOf<String, ViewModel>()

    // other methods...
    
    /**
     * Clears internal storage and notifies `ViewModel`s that they are no longer used.
     */
    public fun clear() {
        for (vm in map.values) {
            vm.clear()
        }
        map.clear()
    }
}
````

Давайте поймем что здесь происходит, когда наш ViewModelStoreOwner(в лице ComponentActivity/Fragment) умирает
окончательно(смерть не связанная с пересозданием из-за изменений конфигураций), в этот момент ViewModelStoreOwner
вызывает метод clear() у ViewModelStore
В этот момент в методе clear() цикл через for пробегается по всем значениям(view models) которые лежат внутри
внутренного HashMap, и вызывает у каждой viewmodel internal метод clear() который в свою очередь будет вызывать метод
onCleared у нашей viewmodel, onCleared тот самый метод который мы можем переопределять у ViewModel который вызывается
только в момент когда наша viewmodel умирает(так как наш актвити/фрагмент умирают окончательно),

```kotlin
public actual abstract class ViewModel {

    // other methods....

    protected actual open fun onCleared() {} // <- метода onCleared которую можно переопределять

    @MainThread
    internal actual fun clear() {
        impl?.clear()
        onCleared() // <- вызов метода onCleared которую можно переопределять
    }
}
```

А соответственно сам метод viewModelStore.clear() вызывает ViewModelStoreOwner(в лице ComponentActivity/Fragment), 
давайте в качестве одного из ViewModelStoreOwner выберем ComponentActivity что бы понять как работает очистка.
Вот фрагмент кода из ComponentActivity, который прослушивает его уничтожение и вызывает ViewModelStore.clear()::

```kotlin
getLifecycle().addObserver(new LifecycleEventObserver() {
    @Override
    public void onStateChanged(@NonNull LifecycleOwner source,
            @NonNull Lifecycle.Event event) { 
        if (event == Lifecycle.Event.ON_DESTROY) { // <- состояние ON_DESTROY является триггером
            // Clear out the available context
            mContextAwareHelper.clearAvailableContext();
            // And clear the ViewModelStore
            if (!isChangingConfigurations()) {  // <- проверка на то можно ли очищать ViewModelStore
                getViewModelStore().clear(); // <- очистка ViewModelStore
            }
            mReportFullyDrawnExecutor.activityDestroyed();
        }
    }
}
```

Мы видим что есть проверка для состояния ON_DESTROY которая проверяет, причиной уничтожения не является 
изменение конфигураций, и в таком случае и очищается ViewModelStore и удаляются все view model-ки

Если стало запутаннее, то вызов следующее ComponentActivity.onDestroy() -> getViewModelStore().clear() -> MyViewModel.onCleared()   