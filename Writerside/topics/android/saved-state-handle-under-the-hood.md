# SavedStateHandle и Bundle под капотом: как Android сохраняет состояние

[//]: # (В этой статье подробно разбирается, как работает сохранение состояния в Android: от старых методов onSaveInstanceState и Bundle до современной архитектуры с SavedStateHandle и SavedStateRegistry. Рассмотрено, как связаны ViewModel, SavedStateHandle, SavedStateRegistryOwner, а также цепочка вызовов, ведущая к сохранению и восстановлению данных. Показана вся внутренняя кухня: низкоуровневые классы (ActivityThread, Instrumentation, ActivityClientRecord) и вся цепочка до onCreate. Глубокий технический разбор для тех, кто хочет понять, как состояние реально сохраняется и восстанавливается под капотом Android.)

Это продолжение трех предыдущих статей.

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`,
2. Во второй — как это устроено во `Fragment`,
3. В третьей где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).

В этой статье рассмотрим Где хранится SavedStateHandle, проверим SavedStateHandle vs onSaveInstanceState vs ViewModel(ViewModelStore)
Поймем связку SavedStateHandle с ViewModel. И узнаем ответ на главный вопрос, где храниться Bundle. Но, как всегда, начнём с базиса. 

### Базис

В статье не будет описания того, как работать с этими API, а будет рассказано о том, как они устроены изнутри, поэтому я буду исходить из
того, что вы уже работали с ними.
Как всегда, начнём с базиса — дадим определения для SavedStateHandle, onSaveInstanceState и ViewModel:

**ViewModel** — компонент архитектурного паттерна MVVM, предоставленный Google как примитив, позволяющий пережить изменение конфигурации.
Изменение конфигурации — это состояние, из-за которого Activity/Fragment пересоздаётся; именно это состояние может пережить ViewModel. Увы,
на этом обязанности ViewModel по хранению данных в контексте Android заканчиваются.

Если же процесс приложения умирает или прерывается, ViewModel не справится; тогда на сцену выходят старые добрые методы
onSaveInstanceState/onRestoreInstanceState.

**onSaveInstanceState/onRestoreInstanceState** — методы жизненного цикла Activity, Fragment и даже View (да, View тоже может сохранять
состояние), которые позволяют сохранять и восстанавливать временное состояние пользовательского интерфейса при изменении конфигурации (
например, при повороте экрана) или при полном уничтожении активности из-за нехватки ресурсов. В onSaveInstanceState данные сохраняются в
Bundle, который автоматически передаётся в onRestoreInstanceState при восстановлении активности.

Это базовый механизм для хранения примитивных типов (и их массивов), Parcelable/Serializable и ещё пары нативных Android-типов. Эти методы
требуют явного указания того, что именно нужно сохранить, а логика прописывается внутри Activity и Fragment. Большинство архитектурных
паттернов (MVI, MVVM) гласят, что View (Fragment/Activity/Compose) должны быть максимально простыми и не содержать никакой логики, кроме
отображения данных, поэтому прямое использование этих методов сейчас уступает место Saved State API, которое хорошо интегрируется с
ViewModel, наделяя её не только возможностью «спасать» данные от изменений конфигурации, но и сохранять сериализуемые данные при уничтожении
или остановке процесса по инициативе системы.

**Saved State API** — современная альтернатива onSaveInstanceState/onRestoreInstanceState, более гибко управляющая состоянием, особенно в
связке с ViewModel.
**SavedStateHandle** — объект, передаваемый в конструктор ViewModel, который позволяет безопасно сохранять и восстанавливать данные даже
после уничтожения процесса. В отличие от статичного onSaveInstanceState, SavedStateHandle также позволяет подписываться на Flow и LiveData
тех данных, которые он хранит и восстанавливает. Он автоматически интегрирован с ViewModel и поддерживает сохранение состояния при
изменениях конфигурации, а также при полном уничтожении процесса приложения. Дополнительное преимущество — возможность подписываться на
изменения значений в SavedStateHandle и получать реактивное поведение прямо в ViewModel.

<tip>Под «уничтожением или прерыванием процесса», о котором идёт речь в статье, подразумевается ситуация, когда приложение находится 
в фоне и сохраняется в стеке задач. Обычно это происходит, когда пользователь сворачивает приложение, не закрывая его. 
Через некоторое время бездействия система может остановить процесс. 
Не стоит путать это с кейсом, когда пользователь сам вручную закрывает приложение — это другой сценарий.</tip>

### onSaveInstanceState / onRestoreInstanceState

Давайте также освежим память о методах onSaveInstanceState и onRestoreInstanceState:

```kotlin
class RestoreActivity : AppCompatActivity() {

    private var counter = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Восстановление значения при пересоздании
        counter = savedInstanceState?.getInt("counter_key") ?: 0
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        // Восстановление значения при пересоздании
        counter = savedInstanceState.getInt("counter_key")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // Сохраняем значение
        outState.putInt("counter_key", counter)
        Log.d("RestoreActivity", "onSaveInstanceState: Counter saved = $counter")
    }
}
```

**onSaveInstanceState** — вызывается для получения состояния Activity перед её уничтожением, чтобы оно могло быть восстановлено в методах
`onCreate` или `onRestoreInstanceState`. `Bundle`, заполненный в этом методе, будет передан в оба метода.

Этот метод вызывается до того, как Activity может быть уничтожена, чтобы при повторном создании она могла восстановить своё состояние. Не
следует путать его с методами жизненного цикла, такими как `onPause` (вызывается всегда, вызывается при частичной потере фокуса Activity) или `onStop` (когда Activity становится невидимой).

* **Пример**, когда `onPause` и `onStop` вызываются, но `onSaveInstanceState` — нет: при возвращении из Activity B в Activity A. В этом
  случае состояние B не требуется восстанавливать, поэтому `onSaveInstanceState` для B не вызывается.
* **Другой пример**: если Activity B запускается поверх Activity A, но A остаётся в памяти, то `onSaveInstanceState` для A также не
  вызывается, так как Activity остаётся в памяти и не требуется сохранять её состояние.

Реализация по умолчанию этого метода автоматически сохраняет большую часть состояния пользовательского интерфейса, 
**вызывая `onSaveInstanceState()` у каждого `View` в иерархии, у которого есть ID**, а также сохраняет ID элемента, находившегося в фокусе.
Восстановление этих данных происходит в стандартной реализации `onRestoreInstanceState()`.
Если вы переопределяете метод для сохранения дополнительной информации, рекомендуется вызвать
реализацию по умолчанию через

```kotlin
super.onSaveInstanceState(outState)
```

— иначе придётся вручную сохранять состояние всех `View`.

Если метод вызывается, то это произойдёт **после `onStop`** для приложений, нацеленных на платформы, начиная с Android P. Для более ранних
версий Android этот метод будет вызван **до `onStop`**, и нет никаких гарантий, будет ли он вызван до или после `onPause`.

<tip title="Документация гласит:">
If called, this method will occur after onStop for applications
targeting platforms starting with android.os.Build.VERSION_CODES.P.
For applications targeting earlier platform versions this method will occur
before onStop and there are no guarantees about whether it will
occur before or after onPause.
</tip>

**onRestoreInstanceState** — этот метод вызывается **после** `onStart`, когда активность повторно инициализируется из ранее сохранённого
состояния, переданного в `savedInstanceState`.
Большинство реализаций используют для восстановления состояния метод `onCreate`, но иногда бывает удобнее делать это здесь, после того как
завершена вся инициализация, или чтобы подклассы могли решить, использовать ли вашу реализацию по умолчанию.
Стандартная реализация этого метода восстанавливает состояние представлений (View), которое было ранее заморожено методом
`onSaveInstanceState`.
Этот метод вызывается **между `onStart` и `onPostCreate`**. Он срабатывает **только при повторном создании активности**; метод **не
вызывается**, если `onStart` был вызван по любой другой причине (например, при переходе из фона на передний план).

На этом примере временно забываем о них, чуть позже мы их снова встретим в более низкоуровневых цепочках вызовов.

### Saved State Api

<note>
С версии 1.3.0-alpha02 androidx.savedstate:savedstate стала поддерживать Kotlin Multiplatform.
Теперь SavedState работает не только на Android (Bundle),
но и на iOS, JVM, Linux и macOS Map&lt;String, Any&gt;, сохраняя совместимость.
</note>

Что бы понять работу **Saved State Api** перепишем пример выше с `onSaveInstanceState` и `onRestoreInstanceState`
используя Saved State Api, делает ровно тоже самое:

```kotlin
class RestoreActivity : AppCompatActivity() {

    private var counter = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Восстановление значения при пересоздании
        counter = savedStateRegistry.consumeRestoredStateForKey("counter_key")?.getInt("counter", 0) ?: 0

        savedStateRegistry.registerSavedStateProvider(
            key = "counter_key",
            provider = object : SavedStateRegistry.SavedStateProvider {
                override fun saveState(): SavedState {
                    return SavedState(bundleOf("counter" to counter))
                }
            }
        )
    }
}
```

Мы вызываем у объекта `savedStateRegistry` метод `registerSavedStateProvider` куда передаем `key` и анонимный объект
`SavedStateRegistry.SavedStateProvider` который
возвращает `Bundle` обернутый в объект `SavedState`, давайте сейчас же определим что из себя представляет этот тип `SavedState`, если зайти
в
исходники, а именно в `expect` логику, то тип описан следующим образом:
**androidx.savedstate.SavedState.kt**:

```kotlin
/**
 * An opaque (empty) common type that holds saveable values to be saved and restored by native
 * platforms that have a concept of System-initiated Process Death.
 *
 * That means, the OS will give the chance for the process to keep the state of the application
 * (normally using a serialization mechanism), and allow the app to restore its state later. That is
 * commonly referred to as "state restoration".
 * ...
 */
public expect class SavedState
```

В контексте `android` нас интересует именно `actual` реализация, по этому далее специфичная для android `actual`

**androidx.savedstate.SavedState.android.kt**:

```kotlin
public actual typealias SavedState = android.os.Bundle
```

Как видим в `Android` нет на самом деле какого-то типа как `SavedState`, в `actual` реализаций это просто `typealias` который ссылается
на тот же старый добрый родной класс `Bundle`, по этому всегда представляйте что там где используется `SavedState` - на самом деле
используется класс `Bundle`, поэтому ничто не мешает нам отказаться от лишней обёртки и вернуть `Bundle` напрямую:

```kotlin
savedStateRegistry.registerSavedStateProvider(
    key = "counter_key",
    provider = object : SavedStateRegistry.SavedStateProvider {
        override fun saveState(): Bundle {
            return bundleOf("counter" to counter)
        }
    }
)
```

Раз с этим разобрались, дальше давайте зайдем в исходники метода `registerSavedStateProvider` и `consumeRestoredStateForKey`,
эти методы вызывается у переменной `savedStateRegistry` которая имеет тип `SavedStateRegistry`, давайте быстро узнаем определение этого
класса:

**`SavedStateRegistry`** - управляет сохранением и восстановлением сохранённого состояния, чтобы данные не терялись при пересоздании
компонентов.
Реализация привязана к `SavedStateRegistryImpl`, которая отвечает за фактическое хранение и восстановление данных.
Интерфейс для подключения компонентов, которые потребляют и вносят данные в сохранённое состояние.
Объект имеет такой же жизненный цикл, как и его владелец (`Activity` или `Fragment`):
когда `Activity` или `Fragment` пересоздаются (например, после уничтожения процесса или изменении конфигурации),
создаётся новый экземпляр этого объекта.

Но откуда берется `savedStateRegistry` переменная внутри `Activity` мы рассмотрим позже, пока достаточно знать
что он есть у `Activity`, далее исходники метода `registerSavedStateProvider` и `consumeRestoredStateForKey` принадлежащий классу
`SavedStateRegistry`(expect):
**androidx.savedstate.SavedStateRegistry.kt**

```kotlin
public expect class SavedStateRegistry internal constructor(
    impl: SavedStateRegistryImpl,
) {

    /** This interface marks a component that contributes to saved state. */
    public fun interface SavedStateProvider {

        public fun saveState(): SavedState
    }

    ...
    public val isRestored: Boolean
    ...
    @MainThread
    public fun consumeRestoredStateForKey(key: String): SavedState?
    ...
    @MainThread
    public fun registerSavedStateProvider(key: String, provider: SavedStateProvider)
    ...
    public fun getSavedStateProvider(key: String): SavedStateProvider?
    ...
    @MainThread
    public fun unregisterSavedStateProvider(key: String)
}
```

Как мы видим на самом деле тут много методов у `SavedStateRegistry`, для нашей статьи достаточно понимать работу методов
`registerSavedStateProvider` и `consumeRestoredStateForKey`, но что бы хоть какое-то понимание было, давайте быстро пройдемся по каждому:

1. **consumeRestoredStateForKey** — извлекает и удаляет из памяти `SavedState`(Bundle), который был зарегистрирован с помощью
   `registerSavedStateProvider`. При повторном вызове возвращает `null`.

2. **registerSavedStateProvider** — регистрирует `SavedStateProvider` с указанным ключом.
   Этот провайдер будет использоваться для сохранения состояния при вызове `onSaveInstanceState`.

3. **getSavedStateProvider** — возвращает зарегистрированный `SavedStateProvider` по ключу или `null`, если он не найден.

4. **unregisterSavedStateProvider** — удаляет из реестра ранее зарегистрированный `SavedStateProvider` по переданному ключу.

5. **SavedStateProvider** — интерфейс, предоставляющий объект `SavedState`(Bundle) при сохранении состояния.

6. **isRestored** — возвращает `true`, если состояние было восстановлено после создания компонента.

В `expect`-версиях отсутствуют реализации — там только сигнатуры методов.
Также мы рассмотрели исходники интерфейса `SavedStateProvider`, который представляет собой callback для получения `Bundle`, подлежащего
сохранению.
Чтобы увидеть реализацию метода `registerSavedStateProvider`, необходимо найти **`actual`-реализацию**, а затем перейти к `actual`
-реализации `SavedStateRegistry`.

**androidx.savedstate.SavedStateRegistry.android.kt**:

```kotlin
public actual class SavedStateRegistry internal actual constructor(
    private val impl: SavedStateRegistryImpl,
) {

    @get:MainThread
    public actual val isRestored: Boolean
        get() = impl.isRestored

    @MainThread
    public actual fun consumeRestoredStateForKey(key: String): SavedState? =
        impl.consumeRestoredStateForKey(key)

    @MainThread
    public actual fun registerSavedStateProvider(key: String, provider: SavedStateProvider) {
        impl.registerSavedStateProvider(key, provider)
    }

    public actual fun getSavedStateProvider(key: String): SavedStateProvider? =
        impl.getSavedStateProvider(key)

    @MainThread
    public actual fun unregisterSavedStateProvider(key: String) {
        impl.unregisterSavedStateProvider(key)
    }

    public actual fun interface SavedStateProvider {
        public actual fun saveState(): SavedState
    }
    ...
}
```

`actual` реализация `SavedStateRegistry` делегирует все вызовы своих методов готовой имплементацией `SavedStateRegistryImpl`,
по этому далее рассмотрим именно `SavedStateRegistryImpl`:

```kotlin
internal class SavedStateRegistryImpl(
    private val owner: SavedStateRegistryOwner,
    internal val onAttach: () -> Unit = {},
) {

    private val keyToProviders = mutableMapOf<String, SavedStateProvider>()
    private var restoredState: SavedState? = null

    @MainThread
    fun consumeRestoredStateForKey(key: String): SavedState? {
        ...
        val state = restoredState ?: return null

        val consumed = state.read { if (contains(key)) getSavedState(key) else null }
        state.write { remove(key) }
        if (state.read { isEmpty() }) {
            restoredState = null
        }

        return consumed
    }

    @MainThread
    fun registerSavedStateProvider(key: String, provider: SavedStateProvider) {
        ..
        keyToProviders[key] = provider
        ...
    }
    ...
}
```

Основные методы для сохранения, давайте просто поймем что здесь происходит:

1. `consumeRestoredStateForKey` - достает значение из `restoredState`(Bundle) по ключу, после того как достает значение,
   удаляет из `restoredState`(Bundle) значение и ключ, `restoredState` является самым коренным `Bundle` который внутри себя хранит все
   другие bundle
2. `registerSavedStateProvider` - просто добавляет объект `SavedStateProvider` внутрь карты `keyToProviders`

Эти методы — очень верхне уровневые и не раскрывают, как именно в итоге сохраняются данные, поэтому нужно копнуть глубже — внутри этого же
класса `SavedStateRegistryImpl`:

```kotlin
internal class SavedStateRegistryImpl(
    private val owner: SavedStateRegistryOwner,
    internal val onAttach: () -> Unit = {},
) {
    private val keyToProviders = mutableMapOf<String, SavedStateProvider>()
    private var restoredState: SavedState? = null

    @MainThread
    internal fun performRestore(savedState: SavedState?) {
        ...
        restoredState =
            savedState?.read {
                if (contains(SAVED_COMPONENTS_KEY)) getSavedState(SAVED_COMPONENTS_KEY) else null
            }
        isRestored = true
    }

    @MainThread
    internal fun performSave(outBundle: SavedState) {
        val inState = savedState {
            restoredState?.let { putAll(it) }
            synchronized(lock) {
                for ((key, provider) in keyToProviders) {
                    putSavedState(key, provider.saveState())
                }
            }
        }

        if (inState.read { !isEmpty() }) {
            outBundle.write { putSavedState(SAVED_COMPONENTS_KEY, inState) }
        }
    }

    private companion object {
        private const val SAVED_COMPONENTS_KEY =
            "androidx.lifecycle.BundlableSavedStateRegistry.key"
    }
}
```

1. `performSave` — вызывается, когда `Activity` или `Fragment` переходит в состояние `pause` -> `stop`, то есть в момент вызова
   `onSaveInstanceState`.
   Этот метод отвечает за сохранение состояния всех `SavedStateProvider`, зарегистрированных через `registerSavedStateProvider`.
   Внутри метода создается объект `inState` типа SavedState (по сути, это сам `Bundle`). Если в restoredState уже есть данные, они
   добавляются в
   `inState`. Затем, в синхронизированном блоке, происходит обход всех зарегистрированных `SavedStateProvider`, вызывается метод
   `saveState`(), и
   результаты сохраняются в `inState`. В конце, если `inState` не пустой, его содержимое записывается в параметр `outBundle` под ключом
   `SAVED_COMPONENTS_KEY`.

2. `performRestore` — вызывается при создании или восстановлении `Activity` или `Fragment`. Этот метод просто читает из `savedState`значение
   по ключу `SAVED_COMPONENTS_KEY`, если оно существует. Найденное значение (вложенный `SavedState`) сохраняется в переменную
   `restoredState`,
   чтобы потом можно было передать его в соответствующие компоненты.

На данный момент мы увидели как работает логика сохранения и регистраций, теперь осталось понять кто же вызывает методы `performSave`
и `performRestore` и в какой момент.

Этой логикой управляет `SavedStateRegistryController`, в связи с тем что Saved State Api тоже на `KMP`, по этому лучше сразу посмотрим
actual версию:

```kotlin
public actual class SavedStateRegistryController private actual constructor(
    private val impl: SavedStateRegistryImpl,
) {

    public actual val savedStateRegistry: SavedStateRegistry = SavedStateRegistry(impl)

    @MainThread
    public actual fun performAttach() {
        impl.performAttach()
    }

    @MainThread
    public actual fun performRestore(savedState: SavedState?) {
        impl.performRestore(savedState)
    }

    @MainThread
    public actual fun performSave(outBundle: SavedState) {
        impl.performSave(outBundle)
    }

    public actual companion object {

        @JvmStatic
        public actual fun create(owner: SavedStateRegistryOwner): SavedStateRegistryController {
            val impl =
                SavedStateRegistryImpl(
                    owner = owner,
                    onAttach = { owner.lifecycle.addObserver(Recreator(owner)) },
                )
            return SavedStateRegistryController(impl)
        }
    }
}
```

И видим, что вызовами методов `SavedStateRegistryImpl.performSave` и `SavedStateRegistryImpl.performRestore` управляют одноимённые методы из
`SavedStateRegistryController`.

Также видим метод `create`, который создаёт `SavedStateRegistryImpl`, передаёт его в конструктор
`SavedStateRegistryController` и возвращает сам `SavedStateRegistryController`.

Далее остаётся только понять, откуда вызываются сами методы `SavedStateRegistryController`. В начале статьи мы отложили разбор источника
поля `savedStateRegistry` в `Activity`. Сейчас самое время разобраться.

Внутри `Activity` нам доступно поле `savedStateRegistry`. Это возможно потому, что `Activity` реализует интерфейс `SavedStateRegistryOwner`.
Если посмотреть исходники, то можно увидеть, что `ComponentActivity` реализует `SavedStateRegistryOwner`. На самом деле `ComponentActivity`
реализует множество интерфейсов, но ниже приведён фрагмент с опущенными остальными родителями:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    private val savedStateRegistryController: SavedStateRegistryController =
        SavedStateRegistryController.create(this)

    final override val savedStateRegistry: SavedStateRegistry
        get() = savedStateRegistryController.savedStateRegistry
}
```

`SavedStateRegistryOwner` - это просто interface который хранит в себе `SavedStateRegistry`, его реализует `Activity`, `Fragment` и
`NavBackStackEntry`, выглядит он следующим образом:

```kotlin
public interface SavedStateRegistryOwner : androidx.lifecycle.LifecycleOwner {
    /** The [SavedStateRegistry] owned by this SavedStateRegistryOwner */
    public val savedStateRegistry: SavedStateRegistry
}
```

`SavedStateRegistry` доступен в любом компоненте, реализующем интерфейс `SavedStateRegistryOwner`. Этим интерфейсом обладают:

* `ComponentActivity` — это базовый класс для всех современных `Activity`.
    ```kotlin
    open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {
    
        private val savedStateRegistryController: SavedStateRegistryController =
            SavedStateRegistryController.create(this)
    
        final override val savedStateRegistry: SavedStateRegistry
            get() = savedStateRegistryController.savedStateRegistry
    }
    ```
* `Fragment` — любой `Fragment` также реализует этот интерфейс.
    ```java
    public class Fragment implements ...SavedStateRegistryOwner,...{
    
        SavedStateRegistryController mSavedStateRegistryController;
        
        @NonNull
        @Override
        public final SavedStateRegistry getSavedStateRegistry() {
            return mSavedStateRegistryController.getSavedStateRegistry();
        }
    }
    ```

* `NavBackStackEntry` - компонент навигаций из Jetpack Navigation
    ```kotlin
    public expect class NavBackStackEntry : ..., SavedStateRegistryOwner {
    
        override val savedStateRegistry: SavedStateRegistry
    
    }
    ```

Мы выяснили большую цепочку вызовов, давайте визуально посмотрим:

```nginx
expect -> SavedStateRegistryController.performSave 
  -> actual SavedStateRegistryController.performSave 
  -> expect SavedStateRegistry 
  -> actual SavedStateRegistry 
  -> SavedStateRegistryImpl.performSave 
  -> SavedStateProvider.saveState() 
  -> // Bundle
```

Углубляться в работу `Fragment` и `NavBackStackEntry` не будем — разберёмся только с `Activity`.
На данный момент мы понимаем, что в конечном итоге все вызовы идут в `SavedStateRegistryController`. Давай посмотрим, как `Activity` с ним
взаимодействует:

Метод `performRestore` у `SavedStateRegistryController`, отвечающий за восстановление данных из `Bundle`, вызывается внутри
`ComponentActivity.onCreate`,
а метод `performSave`, сохраняющий данные в `Bundle`, — внутри `ComponentActivity.onSaveInstanceState`.

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    override fun onCreate(savedInstanceState: Bundle?) {
        savedStateRegistryController.performRestore(savedInstanceState)
        super.onCreate(savedInstanceState)
        ...
    }

    @CallSuper
    override fun onSaveInstanceState(outState: Bundle) {
        ...
        super.onSaveInstanceState(outState)
        savedStateRegistryController.performSave(outState)
    }
}
```

Здесь та самая точка, где `onSaveInstanceState` / `onRestoreInstanceState` объединяются с `SavedStateRegistryController` /
`SavedStateRegistry`.

Теперь переключимся на `ViewModel` и его `SavedStateHandle`, чтобы понять, как он вписывается во всю эту логику.
Для начала объявим обычную `ViewModel`, но в конструкторе передадим `SavedStateHandle`:

```kotlin
class MyViewModel(val savedStateHandle: SavedStateHandle) : ViewModel()
```

<note>
Как и говорилось в начале статьи, это не гайд по тому как пользоваться Saved State Api, тут больше ответ на вопрос как это работает под капотом
</note>

Далее пробуем инициализировать нашу ViewModel в Activity:

```kotlin
class MainActivity : ComponentActivity() {

    private lateinit var viewModel: MyViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        viewModel = ViewModelProvider.create(this).get(MyViewModel::class)
    }

}
```

Тут на первый взгляд можно ожидать, что будет краш при запуске приложения, так как если `ViewModel` на вход принимает какой-либо параметр,
то
нужна фабрика `ViewModel`, он же `ViewModelProvider.Factory`, где мы вручную должны каким-то образом положить требуемый параметр в
конструктор.
И в нашем примере конструктор не пустой, но если мы запустим этот код, то никакого краша и ошибки не будет, всё запустится и
инициализируется должным образом. Почему так?

Разработчики из google знали что часто понадобиться передавать `SavedStateHandle` в `ViewModel`, и что бы разработчикам не приходилось
каждый
раз создавать фабрику для передачи - имеется готовая фабрика которая работает под капотом, так же имеются готовые классы вроде

`AbstractSavedStateViewModelFactory` - начиная с lifecycle-viewmodel-savedstate-android-**2.9.0** - обьявлен устаревшим
`SavedStateViewModelFactory` - актуален на данный момент для создания ViewModel с SavedStateHandle

Давайте теперь посмотрим как это работает на уровне `Activity`, логику `ViewModelProvider/ViewModel` мы уже рассматривали в прошлых статьях,
сейчас просто пройдемся по интересующей нас теме, когда мы обращаемся к `ViewModelProvider.create`:

```kotlin
public expect class ViewModelProvider {
    public companion object {
        ...
        public fun create(
            owner: ViewModelStoreOwner,
            factory: Factory = ViewModelProviders.getDefaultFactory(owner),
            extras: CreationExtras = ViewModelProviders.getDefaultCreationExtras(owner),
        ): ViewModelProvider

    }
}
```

То видим что в качестве factory идет обращение к методу `ViewModelProviders.getDefaultFactory(owner)`, посмотрим его исходники тоже:

```kotlin
internal object ViewModelProviders {
    internal fun getDefaultFactory(owner: ViewModelStoreOwner): ViewModelProvider.Factory =
        if (owner is HasDefaultViewModelProviderFactory) {
            owner.defaultViewModelProviderFactory
        } else {
            DefaultViewModelProviderFactory
        }
}
```

<note>

ViewModelProvider**s** — это утилитный класс, не стоит путать его с `ViewModelProvider`.
</note>

В этом методе нас интересует проверка на `is HasDefaultViewModelProviderFactory`:

```kotlin
if (owner is HasDefaultViewModelProviderFactory) {
    owner.defaultViewModelProviderFactory
}
```

Если `owner` (`ViewModelStoreOwner`, например `Activity` или `Fragment`) реализует интерфейс `HasDefaultViewModelProviderFactory`,
то у него берётся поле `defaultViewModelProviderFactory`. Интерфейс `HasDefaultViewModelProviderFactory` выглядит следующим образом:
**androidx.lifecycle.HasDefaultViewModelProviderFactory.android.kt**

```kotlin
public interface HasDefaultViewModelProviderFactory {

    public val defaultViewModelProviderFactory: ViewModelProvider.Factory

    public val defaultViewModelCreationExtras: CreationExtras
        get() = CreationExtras.Empty
}
```

Реализация интерфейса `HasDefaultViewModelProviderFactory` в `Activity`:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, HasDefaultViewModelProviderFactory, ... {
    ...
    override val defaultViewModelProviderFactory: ViewModelProvider.Factory by lazy {
        SavedStateViewModelFactory(application, this, if (intent != null) intent.extras else null)
    }

    @get:CallSuper
    override val defaultViewModelCreationExtras: CreationExtras
        /**
         * {@inheritDoc}
         *
         * The extras of [getIntent] when this is first called will be used as the defaults to any
         * [androidx.lifecycle.SavedStateHandle] passed to a view model created using this extra.
         */
        get() {
            val extras = MutableCreationExtras()
            if (application != null) {
                extras[APPLICATION_KEY] = application
            }
            extras[SAVED_STATE_REGISTRY_OWNER_KEY] = this
            extras[VIEW_MODEL_STORE_OWNER_KEY] = this
            val intentExtras = intent?.extras
            if (intentExtras != null) {
                extras[DEFAULT_ARGS_KEY] = intentExtras
            }
            return extras
        }
    ...
}
```

Тут происходят два очень важных момента:

1. `defaultViewModelProviderFactory` — в качестве фабрики по умолчанию используется `SavedStateViewModelFactory`.
2. `defaultViewModelCreationExtras` — в `CreationExtras` кладётся `SavedStateRegistryOwner` под ключом `SAVED_STATE_REGISTRY_OWNER_KEY`
   и `ViewModelStoreOwner` под ключом `VIEW_MODEL_STORE_OWNER_KEY`.

Это ключевая часть того как в итоге `SavedStateHandle` подключается к `ViewModel` и к `SavedStateRegistryOwner`

Чтобы понять, как `SavedStateHandle` создаётся и восстанавливается для `ViewModel`, давайте разберёмся, что происходит в
`SavedStateViewModelFactory`

**androidx.lifecycle.SavedStateViewModelFactory.android.kt:**

```kotlin
public actual class SavedStateViewModelFactory :
    ViewModelProvider.OnRequeryFactory, ViewModelProvider.Factory {

    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        ...
        return if (
            extras[SAVED_STATE_REGISTRY_OWNER_KEY] != null &&
            extras[VIEW_MODEL_STORE_OWNER_KEY] != null
        ) {
            ...
            newInstance(modelClass, constructor, extras.createSavedStateHandle())
            ...
        }
        ...
    }
}

internal fun <T : ViewModel?> newInstance(
    modelClass: Class<T>,
    constructor: Constructor<T>,
    vararg params: Any
): T {
    return try {
        constructor.newInstance(*params)
    }
    ...
}
```

Тут сокращена логика из исходников, чтобы сосредоточиться на главном. Внутри метода `create` у фабрики проверяется, содержат ли `extras`поля
с ключами `SAVED_STATE_REGISTRY_OWNER_KEY` и `VIEW_MODEL_STORE_OWNER_KEY`.
Если содержат — вызывается метод `newInstance`, который через рефлексию вызывает конструктор и передаёт параметры, одним из которых является
`SavedStateHandle`.

Но нас интересует другой момент. Обратим внимание на вызов `createSavedStateHandle()`:

```kotlin
newInstance(modelClass, constructor, extras.createSavedStateHandle())
```

Что происходит внутри `createSavedStateHandle()`? Чтобы понять, как создаётся `SavedStateHandle`, нужно заглянуть в исходный код этого
метода:

**androidx.lifecycle.SavedStateHandleSupport.kt:**

```kotlin
@MainThread
public fun CreationExtras.createSavedStateHandle(): SavedStateHandle {
    val savedStateRegistryOwner =
        this[SAVED_STATE_REGISTRY_OWNER_KEY]
            ?: throw IllegalArgumentException(
                "CreationExtras must have a value by `SAVED_STATE_REGISTRY_OWNER_KEY`"
            )
    val viewModelStateRegistryOwner =
        this[VIEW_MODEL_STORE_OWNER_KEY]
            ?: throw IllegalArgumentException(
                "CreationExtras must have a value by `VIEW_MODEL_STORE_OWNER_KEY`"
            )

    val defaultArgs = this[DEFAULT_ARGS_KEY]
    val key =
        this[VIEW_MODEL_KEY]
            ?: throw IllegalArgumentException(
                "CreationExtras must have a value by `VIEW_MODEL_KEY`"
            )
    return createSavedStateHandle(
        savedStateRegistryOwner,
        viewModelStateRegistryOwner,
        key,
        defaultArgs
    )
}
```

Здесь из CreationExtras извлекаются три ключевых объекта:

1. savedStateRegistryOwner — ссылка на SavedStateRegistry для управления состоянием.
2. viewModelStateRegistryOwner — ссылка на ViewModelStore для привязки к жизненному циклу.
3. defaultArgs — начальные параметры, если они были переданы.

Все эти зависимости передаются в другой метод `createSavedStateHandle`, который как раз и занимается созданием или восстановлением
SavedStateHandle для данной ViewModel.

**androidx.lifecycle.SavedStateHandleSupport.kt:**

```kotlin
private fun createSavedStateHandle(
    savedStateRegistryOwner: SavedStateRegistryOwner,
    viewModelStoreOwner: ViewModelStoreOwner,
    key: String,
    defaultArgs: SavedState?
): SavedStateHandle {
    val provider = savedStateRegistryOwner.savedStateHandlesProvider
    val viewModel = viewModelStoreOwner.savedStateHandlesVM
    return viewModel.handles[key]
        ?: SavedStateHandle.createHandle(provider.consumeRestoredStateForKey(key), defaultArgs)
            .also { viewModel.handles[key] = it }
}
```

Тут сначала ищется нужный `SavedStateHandle` внутри `SavedStateHandlesVM`. Если он не найден — создаётся новый, сохраняется в
`SavedStateHandlesVM`,
а функция `createSavedStateHandle` возвращает управление обратно в `CreationExtras.createSavedStateHandle()`, которую мы уже видели.
В конечном итоге управление возвращается в фабрику, таким образом создаётся `SavedStateHandle` для конкретной `ViewModel`.

Также в этом методе видим вызовы вроде `savedStateRegistryOwner.savedStateHandlesProvider` и `viewModelStoreOwner.savedStateHandlesVM`.

Теперь посмотрим, как это связано с провайдером. В коде вызывается `savedStateRegistryOwner.savedStateHandlesProvider`.
На самом деле это просто extension свойство, которая вытаскивает объект (`SavedStateProvider`) из `SavedStateRegistry`.

Этот провайдер отвечает за доступ ко всем сохранённым состояниям (`SavedStateHandle`), привязанным к разным `ViewModel`.
Перейдем к провайдеру: `savedStateHandlesProvider`

**androidx.lifecycle.SavedStateHandleSupport.kt:**

```kotlin
internal val SavedStateRegistryOwner.savedStateHandlesProvider: SavedStateHandlesProvider
get() =
    savedStateRegistry.getSavedStateProvider(SAVED_STATE_KEY) as? SavedStateHandlesProvider
        ?: throw IllegalStateException(
            "enableSavedStateHandles() wasn't called " +
                    "prior to createSavedStateHandle() call"
        )

internal class SavedStateHandlesProvider(
    private val savedStateRegistry: SavedStateRegistry,
    viewModelStoreOwner: ViewModelStoreOwner
) : SavedStateRegistry.SavedStateProvider {
    private var restored = false
    private var restoredState: SavedState? = null

    private val viewModel by lazy { viewModelStoreOwner.savedStateHandlesVM }

    override fun saveState(): SavedState {
        return savedState {
            restoredState?.let { putAll(it) }
            viewModel.handles.forEach { (key, handle) ->
                val savedState = handle.savedStateProvider().saveState()
                if (savedState.read { !isEmpty() }) {
                    putSavedState(key, savedState)
                }
            }
            restored = false
        }
    }

    fun performRestore() {
        ...
    }

    fun consumeRestoredStateForKey(key: String): SavedState? {
        ...
    }
}
```

`SavedStateHandlesProvider` — это прослойка между `SavedStateRegistry` и `SavedStateHandle`, обеспечивающая централизованное сохранение и
восстановление состояний `ViewModel`. В методе `saveState()` собираются все актуальные состояния из `viewModel.handles`, добавляется
возможное ранее восстановленное состояние, и итог сохраняется в `SavedStateRegistry`.

Для выборочного восстановления используется метод `consumeRestoredStateForKey()`, позволяющий получить состояние по ключу без необходимости
загружать всё сразу. Восстановление и подготовка состояний происходят в `performRestore()`.

По сути, `SavedStateHandlesProvider` управляет жизненным циклом всех `SavedStateHandle` в рамках владельца состояния, поддерживая логику
ленивого восстановления и гарантируя корректное сохранение после процесса или конфигурационных изменений.

**Взаимодействие с `SavedStateHandlesVM`:**

Теперь перейдём к тому, как данные хранятся внутри `ViewModel`. `savedStateHandlesVM` — это
расширение, которое создаёт или восстанавливает
объект `SavedStateHandlesVM`, хранящий в себе Map из ключей на `SavedStateHandle`:

```kotlin
internal val ViewModelStoreOwner.savedStateHandlesVM: SavedStateHandlesVM
get() =
    ViewModelProvider.create(
        owner = this,
        factory =
            object : ViewModelProvider.Factory {
                override fun <T : ViewModel> create(
                    modelClass: KClass<T>,
                    extras: CreationExtras
                ): T {
                    @Suppress("UNCHECKED_CAST") return SavedStateHandlesVM() as T
                }
            }
    )[VIEWMODEL_KEY, SavedStateHandlesVM::class]

internal class SavedStateHandlesVM : ViewModel() {
    val handles = mutableMapOf<String, SavedStateHandle>()
}
```

Здесь создаётся объект `SavedStateHandlesVM`, внутри которого поддерживается `Map`, связывающая ключи с объектами `SavedStateHandle`.
`SavedStateHandlesVM` нужен для того, чтобы хранить и управлять всеми `SavedStateHandle` всех `ViewModel` в рамках одного
`ViewModelStoreOwner` и `SavedStateRegistryOwner`.

`SavedStateHandlesProvider` — класс, реализующий интерфейс `SavedStateProvider`. Когда `SavedStateController` вызывает `performSave`,
он также обращается к `SavedStateHandlesProvider` и вызывает его метод `saveState`. Далее он кладёт все существующие `SavedStateHandle` в
объект `SavedState` (`Bundle`) и возвращает его.

Но чтобы весь этот процесс работал, необходимо зарегистрировать `SavedStateHandlesProvider` в `SavedStateRegistry`,
однако пока что в коде мы не встретили блок, отвечающий за регистрацию провайдера, то есть вызов метода:
`savedStateRegistry.registerSavedStateProvider(...)`

На самом деле такая логика есть, и она триггерится внутри `ComponentActivity`, `Fragment` и `NavBackStackEntry`,
то есть во всех `SavedStateRegistryOwner`. Давайте просто глянем, как это вызывается в `ComponentActivity`:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    init {
        ...
        enableSavedStateHandles()
        ...
    }
}
```

Видим вызов некого метода `enableSavedStateHandles` — само название звучит заманчиво. Далее — исходники метода `enableSavedStateHandles`:

```kotlin
@MainThread
public fun <T> T.enableSavedStateHandles() where T : SavedStateRegistryOwner, T : ViewModelStoreOwner {
    ...
    if (savedStateRegistry.getSavedStateProvider(SAVED_STATE_KEY) == null) {
        val provider = SavedStateHandlesProvider(savedStateRegistry, this)
        savedStateRegistry.registerSavedStateProvider(SAVED_STATE_KEY, provider)
        lifecycle.addObserver(SavedStateHandleAttacher(provider))
    }
}
```

`enableSavedStateHandles` — это типизированный метод, который требует, чтобы вызывающая область одновременно являлась и
`SavedStateRegistryOwner`,
и `ViewModelStoreOwner`. `ComponentActivity` / `Fragment` / `NavBackStackEntry` идеально подходят под это — все трое реализуют оба
интерфейса.

Давайте вкратце поймём, что происходит в этом методе.
Для начала у `SavedStateRegistry` запрашивается сохранённый `provider` (`SavedStateProvider`) по ключу `SAVED_STATE_KEY`. Это ключ для
хранения `SavedStateHandlesProvider` (он же `SavedStateProvider`).

Если по ключу ничего не найдено, то есть `null`, это означает, что `provider` ещё не был зарегистрирован. Тогда создаётся объект
`SavedStateHandlesProvider` (он же `SavedStateProvider`) и регистрируется в `savedStateRegistry`.

Мы подробно разобрали, как механизм `SavedStateHandle` автоматически создаётся и подключается к `ViewModel`. Это достигается за счёт
встроенного механизма фабрики `SavedStateViewModelFactory`, которая при создании ViewModel извлекает необходимые зависимости из объекта
`CreationExtras`. Эти зависимости включают в себя:

1. **SavedStateRegistryOwner** — для управления сохранением и восстановлением состояния.
2. **ViewModelStoreOwner** — для привязки жизненного цикла ViewModel.
3. **DefaultArgs** — начальные параметры, если они были переданы.

В момент инициализации ViewModel, фабрика `SavedStateViewModelFactory` через метод `createSavedStateHandle` формирует объект
`SavedStateHandle`. Этот объект связывается с `SavedStateRegistry` и регистрируется в нём посредством специального провайдера —
`SavedStateHandlesProvider`(SavedStateProvider).

Механизм регистрации провайдера запускается автоматически при создании `ComponentActivity`, `Fragment` или `NavBackStackEntry`. Это
обеспечивается вызовом метода `enableSavedStateHandles`, который регистрирует провайдер в `SavedStateRegistry` под ключом `SAVED_STATE_KEY`.
В дальнейшем, при вызове `onSaveInstanceState`, этот провайдер сохраняет все текущие состояния из SavedStateHandle, привязанные к ключам
`ViewModel`.

Таким образом, когда компонент пересоздаётся (например, при смене ориентации экрана или в случае уничтожения и восстановления Activity),
механизм восстановления срабатывает автоматически. `SavedStateRegistry` восстанавливает состояние из провайдера, а `SavedStateHandle` вновь
связывается с ViewModel, обеспечивая прозрачную работу с сохранёнными данными.

Это позволяет нам не заботиться о ручной передаче сохранённого состояния при каждом пересоздании ViewModel. Android-фреймворк делает это за
нас, используя мощный механизм фабрик и хранилищ состояний, что делает `SavedStateHandle` удобным и надежным инструментом для управления
состоянием внутри ViewModel.

На текущий момент мы понимаем, как `SavedStateHandle` работает в связке с `ViewModel` и как он в итоге соединяется с `SavedStateRegistry`.
Также до этого мы узнали, как работают сам `SavedStateRegistry` и `SavedStateRegistryController`, и увидели их связь с методами
`onSaveInstanceState` и `onRestoreInstanceState`.

Оказалось, что и `Saved State API`, и древние методы `onSaveInstanceState` / `onRestoreInstanceState` в конечном итоге работают по одному и
тому же пути.
Давайте вернёмся к точке, где они встречаются. Далее — код, который мы уже видели:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    override fun onCreate(savedInstanceState: Bundle?) {
        savedStateRegistryController.performRestore(savedInstanceState)
        super.onCreate(savedInstanceState)
        ...
    }

    @CallSuper
    override fun onSaveInstanceState(outState: Bundle) {
        ...
        super.onSaveInstanceState(outState)
        savedStateRegistryController.performSave(outState)
    }
}
```

То есть в стандартной практике при использовании механизма сохранения состояния применяются два метода:

* `onCreate` — получает на вход параметр `savedInstanceState` типа `Bundle`. Именно в этом методе читаются сохранённые значения.
* `onSaveInstanceState` — получает на вход параметр `outState` типа `Bundle`. В этот параметр записываются значения, которые должны быть
  сохранены.

Давайте разберёмся, каким образом вся эта конструкция работает:
как значения, сохранённые в `outState` метода `onSaveInstanceState`, переживают изменение конфигурации и даже смерть процесса,
и как эти сохранённые данные возвращаются обратно в `onCreate`.

Посмотрим на реализацию метода `onSaveInstanceState` в `super`, то есть в самом классе `Activity`:

```java
public class Activity extends ContextThemeWrapper ...{

final void performSaveInstanceState(@NonNull Bundle outState) {
       ...
    onSaveInstanceState(outState);
       ...
}

protected void onSaveInstanceState(@NonNull Bundle outState) {
       ...
}
}
```

Всё, что происходит внутри этого метода, нас сейчас не волнует. Главное, что `onSaveInstanceState` вызывает другой финальный метод —
`performSaveInstanceState`.

Теперь давайте поймём, кто вызывает `performSaveInstanceState`. Этот вызов инициируется классом `Instrumentation`:

**android.app.Instrumentation.java:**

```java

@android.ravenwood.annotation.RavenwoodKeepPartialClass
public class Instrumentation {
   ...

    public void callActivityOnSaveInstanceState(@NonNull Activity activity,
                                                @NonNull Bundle outState) {
        activity.performSaveInstanceState(outState);
    }
   ...
}
```

<note title="Официальная документация гласит следующее об этом классе:">
Base class for implementing application instrumentation code.  
When running with instrumentation turned on, this class will be instantiated for you before any of the application code,  
allowing you to monitor all of the interaction the system has with the application.  
An Instrumentation implementation is described to the system through an AndroidManifest.xml's <instrumentation/> tag.
</note>

Теперь нужно понять, кто же вызывает `Instrumentation.callActivityOnSaveInstanceState`? И тут мы встречаем `ActivityThread`:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {
    ...

    private void callActivityOnSaveInstanceState(ActivityClientRecord r) {
        r.state = new Bundle();
        r.state.setAllowFds(false);
        if (r.isPersistable()) {
            r.persistentState = new PersistableBundle();
            mInstrumentation.callActivityOnSaveInstanceState(
                    r.activity, r.state,
                    r.persistentState
            );
        } else {
            mInstrumentation.callActivityOnSaveInstanceState(r.activity, r.state);
        }
    }
   ...
}
```

Что здесь происходит? `callActivityOnSaveInstanceState` на вход принимает параметр `r` типа `ActivityClientRecord`.
У этого класса есть поле `state`, которое является `Bundle`. Ему присваивается новый объект `Bundle`.

Класс `ActivityClientRecord` мы уже встречали, когда рассматривали `ViewModelStore`.
`ActivityClientRecord` представляет собой запись активности и используется для хранения всей информации, связанной с реальным экземпляром
активности.
Это своего рода структура данных для учёта активности в процессе выполнения приложения.

Основные поля класса `ActivityClientRecord`:

- `state` — объект `Bundle`, содержащий сохраненное состояние активности. Да, да, это тот самый Bundle который мы
  получаем в методе `onCreate`, `onRestoreInstanceState` и `onSaveInstanceState`
- `lastNonConfigurationInstances` — объект `Activity#NonConfigurationInstance`, в котором хранится
  `ComponentActivity#NonConfigurationInstances` в котором хранится`ViewModelStore`.
- `intent` — объект `Intent`, представляющий намерение запуска активности.
- `window` — объект `Window`, связанный с активностью.
- `activity` — сам объект `Activity`.
- `parent` — родительская активность (если есть).
- `createdConfig` — объект `Configuration`, содержащий настройки, примененные при создании активности.
- `overrideConfig` — объект `Configuration`, содержащий текущие настройки активности.

Пока что не будем отвлекаться, и узнаем кто же вызывает `callActivityOnSaveInstanceState`:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    private void callActivityOnStop(ActivityClientRecord r, boolean saveState, String reason) {
        final boolean shouldSaveState = saveState && !r.activity.mFinished && r.state == null
                && !r.isPreHoneycomb();
        final boolean isPreP = r.isPreP();
        if (shouldSaveState && isPreP) {
            callActivityOnSaveInstanceState(r);
        }
        ...
    }

    private Bundle performPauseActivity(ActivityClientRecord r, boolean finished, String reason,
                                        PendingTransactionActions pendingActions) {
       ...
        final boolean shouldSaveState = !r.activity.mFinished && r.isPreHoneycomb();
        if (shouldSaveState) {
            callActivityOnSaveInstanceState(r);
        }
       ...
    }
}
```

Метод callActivityOnStop определяет, нужно ли сохранять состояние активности перед остановкой.
Проверяется флаг saveState, активность не должна быть завершена (!mFinished), состояние (r.state) должно быть ещё не сохранено,
и версия должна быть до Honeycomb (!isPreHoneycomb()).
Если все условия выполняются и версия до Android P (isPreP()), вызывается callActivityOnSaveInstanceState, чтобы создать и заполнить Bundle

Метод performPauseActivity проверяет, нужно ли сохранить состояние перед паузой.
Здесь условия упрощены: активность не должна быть завершена, версия — до Honeycomb.
Если да, то снова вызывается callActivityOnSaveInstanceState для формирования Bundle.

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    private void performStopActivityInner(ActivityClientRecord r, StopInfo info,
                                          boolean saveState, boolean finalStateRequest, String reason) {
      ...
        callActivityOnStop(r, saveState, reason);
    }

    private void handleRelaunchActivityInner(@NonNull ActivityClientRecord r,...) {
       ...
        if (!r.stopped) {
            callActivityOnStop(r, true /* saveState */, reason);
        }
       ...
    }
}
```

performStopActivityInner используется при полной остановке активности.
Внутри сразу вызывается callActivityOnStop, который проверяет и, если нужно, инициирует сохранение состояния.
Это гарантирует, что состояние активности попадёт в Bundle до того, как активность будет остановлена и уничтожена.

В handleRelaunchActivityInner вызывается callActivityOnStop, если активность ещё не остановлена (!r.stopped).
Это важно при пересоздании активности (например, при изменении конфигурации), чтобы сохранить состояние до пересоздания.

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {
    @Override
    public void handleRelaunchActivity(@NonNull ActivityClientRecord tmp,
                                       @NonNull PendingTransactionActions pendingActions) {
      ...
        handleRelaunchActivityInner(r, tmp.pendingResults, tmp.pendingIntents,
                pendingActions, tmp.startsNotResumed, tmp.overrideConfig, tmp.mActivityWindowInfo,
                "handleRelaunchActivity");
    }


    @Override
    public void handleStopActivity(ActivityClientRecord r,
                                   PendingTransactionActions pendingActions, boolean finalStateRequest, String reason) {
      ...
        performStopActivityInner(r, stopInfo, true /* saveState */, finalStateRequest,
                reason);
      ...
    }
}
```

handleRelaunchActivity — внешний метод, который вызывает handleRelaunchActivityInner.
Используется для обработки полного пересоздания активности.
Все проверки и логика сохранения состояния уже находятся внутри handleRelaunchActivityInner.

handleStopActivity вызывает performStopActivityInner, передавая туда флаг saveState = true, чтобы принудительно сохранить состояние перед
окончательной остановкой.
Это используется, например, при закрытии приложения или выгрузке активности системой.

Последующие вызовы методов `performStopActivity` и `handleRelaunchActivity` упираются в классы `ActivityRelaunchItem.execute()`
и `StopActivityItem.execute()`.
Метод `performStopActivity` вызывается из `StopActivityItem.execute()`, а `handleRelaunchActivity` — из `ActivityRelaunchItem.execute()`.

```java
public class StopActivityItem extends ActivityLifecycleItem {
    @Override
    public void execute(@NonNull ClientTransactionHandler client, @NonNull ActivityClientRecord r,
                        @NonNull PendingTransactionActions pendingActions) {
        client.handleStopActivity(r, pendingActions,
                true /* finalStateRequest */, "STOP_ACTIVITY_ITEM");
        Trace.traceEnd(TRACE_TAG_ACTIVITY_MANAGER);
    }
}
```

В методе `StopActivityItem.execute` видим вызов `client.handleStopActivity`.
Так как `client` — это `ClientTransactionHandler`, а `ActivityThread` наследуется от него, фактически здесь вызывается
`ActivityThread.handleStopActivity`.

```java
public class ActivityRelaunchItem extends ActivityTransactionItem {
    @Override
    public void execute(@NonNull ClientTransactionHandler client, @NonNull ActivityClientRecord r,
                        @NonNull PendingTransactionActions pendingActions) {
        client.handleRelaunchActivity(mActivityClientRecord, pendingActions);
    }
}
```

В методе `ActivityRelaunchItem.execute` видим вызов `client.handleRelaunchActivity`.
По той же логике, фактически вызывается `ActivityThread.handleRelaunchActivity`.

На данный момент мы выследили следующую цепочку вызовов:

`StopActivityItem.execute` → `ActivityThread.handleStopActivity` → `ActivityThread.performStopActivityInner` →
`ActivityThread.callActivityOnStop` → `ActivityThread.callActivityOnSaveInstanceState` →
`Instrumentation.callActivityOnSaveInstanceState` → `Activity.performSaveInstanceState` → `Activity.onSaveInstanceState`.

Это ключевая цепочка, которая обеспечивает сохранение состояния `Activity` при изменениях конфигурации или её завершении.
Обратим внимание, что вызов `callActivityOnSaveInstanceState` из `Instrumentation` — это как раз та точка, где система передаёт управление
обратно в `Activity`, вызывая метод `performSaveInstanceState`, который инициирует сохранение всех данных в объект `Bundle`.

Параллельно, в случае изменения конфигурации или пересоздания активности, запускается другая цепочка:

`ActivityRelaunchItem.execute` → `ActivityThread.handleRelaunchActivity` → `ActivityThread.handleRelaunchActivityInner` →
`ActivityThread.callActivityOnStop` → `ActivityThread.callActivityOnSaveInstanceState` →
`Instrumentation.callActivityOnSaveInstanceState` → `Activity.performSaveInstanceState` → `Activity.onSaveInstanceState`.

Эти две цепочки работают независимо, но сходятся в методе `callActivityOnStop`, который гарантирует сохранение данных в `Bundle` перед тем,
как `Activity` будет остановлена или пересоздана.

Далее, сформированный объект `Bundle`, содержащий состояние `Activity`, сохраняется в объекте `ActivityClientRecord`.
Этот объект представляет собой структуру данных, хранящую всю необходимую информацию о `Activity` во время её жизненного цикла.
Именно в поле `state` этого класса система сохраняет переданный `Bundle`, чтобы при пересоздании активности восстановить её состояние.
`ActivityClientRecord` существует в процессе всех вызовов цепочки, перед тем как `Activity` перейдёт в состояние STOP.
Внутри метода `ActivityThread.callActivityOnSaveInstanceState` полю `ActivityClientRecord.state` присваивается новый `Bundle`,
в который активити и фрагменты кладут всё нужное — от состояния иерархий `View` до любых данных, которые разработчик решил сохранить.

Таким образом, мы видим, что эта цепочка запускается не из самой `Activity`, а из внутренней логики Android через `ActivityThread`.
Это ещё раз подтверждает, что все жизненные циклы управляются системой через единый механизм клиент-серверных транзакций,
а `ActivityThread` выполняет роль посредника, координирующего вызовы между `Activity` и системой.

Важный момент здесь — откуда берётся `ActivityClientRecord` и как его внутренний `Bundle` переживает смерть процесса.
В случае сохранения между PAUSE/STOP мы увидели, где создаётся чистый `Bundle`, в который можно сохранять данные.
Здесь особых секретов нет. Но то, как этот сохранённый `Bundle` внутри `ActivityClientRecord` переживает смерть системы
и затем возвращается в `Activity.onCreate`, мы ещё не знаем. Следующая глава раскроет этот момент.

## Цепочка вызова onCreate

Начнем наше движение с самого низа — с метода `onCreate`. Как видно из кода, его вызов происходит внутри метода `performCreate`, который, в
свою очередь, вызывается из метода `callActivityOnCreate` класса `Instrumentation`.

```java
public class Activity extends ContextThemeWrapper ...{

public void onCreate(@Nullable Bundle savedInstanceState, @Nullable PersistableBundle persistentState) {
    onCreate(savedInstanceState);
}

@MainThread
@CallSuper
protected void onCreate(@Nullable Bundle savedInstanceState) {
            ...
}

final void performCreate(Bundle icicle) {
    performCreate(icicle, null);
}

@UnsupportedAppUsage(maxTargetSdk = Build.VERSION_CODES.R, trackingBug = 170729553)
final void performCreate(Bundle icicle, PersistableBundle persistentState) {
            ...
    if (persistentState != null) {
        onCreate(icicle, persistentState);
    } else {
        onCreate(icicle);
    }
            ...
}
}
```

Метод `performCreate` является связующим звеном между логикой вызова `onCreate` и более низкоуровневыми компонентами системы.
Сам же вызов `performCreate` осуществляется в классе `Instrumentation`:

```java
public class Instrumentation {
    ...

    public void callActivityOnCreate(Activity activity, Bundle icicle) {
        ...
        activity.performCreate(icicle);
        ...
    }
}
```

Класс `Instrumentation` управляет жизненным циклом `Activity` и вызывает `performCreate`, передавая ему объект `Bundle` для восстановления
состояния. Теперь поднимемся выше. Кто же вызывает `callActivityOnCreate`?
За это отвечает метод `performLaunchActivity` в классе `ActivityThread`:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    private Activity performLaunchActivity(ActivityClientRecord r, Intent customIntent) {
        ...
        if (r.isPersistable()) {
            mInstrumentation.callActivityOnCreate(activity, r.state, r.persistentState);
        } else {
            mInstrumentation.callActivityOnCreate(activity, r.state);
        }
        ...
    }
}
```

Здесь мы видим, что в зависимости от состояния активности (сохранено ли оно в `PersistentState`), `callActivityOnCreate` вызывается с разным
количеством параметров, но всегда через `Instrumentation`.

Далее, этот метод `performLaunchActivity` вызывается из метода `handleLaunchActivity` того же класса:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    @Override
    public Activity handleLaunchActivity(ActivityClientRecord r, ...) {
    ...
        final Activity a = performLaunchActivity(r, customIntent);
    ...
    }
}
```

### Перезапуск Activity при релаунче (например, при повороте экрана) {id="activity_1"}

При пересоздании Activity, например, при повороте экрана, срабатывает метод `handleRelaunchActivity`:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    @Override
    public void handleRelaunchActivity(@NonNull ActivityClientRecord tmp,
                                       @NonNull PendingTransactionActions pendingActions) {
        ...
        handleRelaunchActivityInner(r, tmp.pendingResults, tmp.pendingIntents,
                pendingActions, tmp.startsNotResumed, tmp.overrideConfig, tmp.mActivityWindowInfo,
                "handleRelaunchActivity");
    }

    private void handleRelaunchActivityInner(@NonNull ActivityClientRecord r,...) {
    ....
        handleLaunchActivity(r, pendingActions, mLastReportedDeviceId, customIntent);
    }
}
```

Вызов метода handleRelaunchActivity иницирует класс команда/транзакция `ActivityRelaunchItem`, которая действует как маркер для того,
чтобы выполнить перезапуск с сохранением состояния:

```java
public class ActivityRelaunchItem extends ActivityTransactionItem {

    @Override
    public void execute(@NonNull ClientTransactionHandler client, @NonNull ActivityClientRecord r,
                        @NonNull PendingTransactionActions pendingActions) {
        ...
        client.handleRelaunchActivity(mActivityClientRecord, pendingActions);
        ...
    }
}

```

Эта команда инициирует следующую цепочку вызовов:

`ActivityRelaunchItem.execute` → `handleRelaunchActivity` → `handleRelaunchActivityInner` → `handleLaunchActivity` →
`performLaunchActivity` → `callActivityOnCreate` → `performCreate` → `onCreate`.

### Создание Activity после уничтожения процесса или при первом запуске

В случае, если процесс был уничтожен или это первый запуск `Activity`, используется другая команда — `LaunchActivityItem`. Она запускает
аналогичную, но отдельную цепочку вызовов:

```java
public class LaunchActivityItem extends ClientTransactionItem {

    @Nullable
    private final Bundle mState;

    @Nullable
    private final PersistableBundle mPersistentState;

    public LaunchActivityItem(
            // остальные параметры
            @Nullable Bundle state,
            @Nullable PersistableBundle persistentState,
            // остальные параметры
    ) {
        this(
                // передаваемые аргументы до
                state != null ? new Bundle(state) : null,
                persistentState != null ? new PersistableBundle(persistentState) : null,
                // оставшиеся аргументы
        );
    ...
    }


    @Override
    public void execute(@NonNull ClientTransactionHandler client,
                        @NonNull PendingTransactionActions pendingActions) {
        ...
        ActivityClientRecord r = new ActivityClientRecord(...,mState, mPersistentState, ...);
        client.handleLaunchActivity(r, pendingActions, mDeviceId, null /* customIntent */);
        ...
    }
}

```

Цепочка выглядит так:
`LaunchActivityItem.execute` → `ActivityThread.handleLaunchActivity` → `ActivityThread.performLaunchActivity` →
`ActivityThread.callActivityOnCreate` → `ActivityperformCreate` → `ActivityonCreate`.

Следует запомнить важную вещь, прежде чем подниматься выше, нужно понимать что `LaunchActivityItem` — это транзакция, которая в своём
конструкторе принимает`Bundle` и `PersistableBundle` (последний мы рассматривать не будем).
Класс `LaunchActivityItem` наследуется от `ClientTransactionItem`.

`ClientTransactionItem` — это абстрактный базовый класс, от которого наследуются все транзакции, связанные с жизненным циклом `Activity`.
В него входят `LaunchActivityItem`, `ActivityRelaunchItem`, `ResumeActivityItem` (последние — **не прямые**, а транзитивные наследники) и
другие элементы, участвующие в управлении состоянием `Activity`.

Мы увидели что создание ActivityClientRecord происходит в `LaunchActivityItem.execute`, но она использует готовые данные которые
бьли переданы ей в конструктор при созданий.

Наша цель дальше — выяснить два момента:

1. **Кто создаёт `LaunchActivityItem` и передаёт в него `Bundle`**, который как раз и переживает смерть или остановку процесса.
2. **Кто вызывает метод `execute` у `LaunchActivityItem`** и запускает описанную выше цепочку вызовов :
   `LaunchActivityItem.execute` → `handleLaunchActivity` → `performLaunchActivity` → `callActivityOnCreate` → `performCreate` → `onCreate`.

И так идем дальше, выше вызова `LaunchActivityItem.execute`, стоит класс `TransactionExecutor`

```java
public class TransactionExecutor {

    private final ClientTransactionHandler mTransactionHandler;

    public TransactionExecutor(@NonNull ClientTransactionHandler clientTransactionHandler) {
        mTransactionHandler = clientTransactionHandler;
    }

    public void execute(@NonNull ClientTransaction transaction) {
        ...
        executeTransactionItems(transaction);
        ...
    }

    public void executeTransactionItems(@NonNull ClientTransaction transaction) {
        final List<ClientTransactionItem> items = transaction.getTransactionItems();
        final int size = items.size();
        for (int i = 0; i < size; i++) {
            final ClientTransactionItem item = items.get(i);
            if (item.isActivityLifecycleItem()) {
                executeLifecycleItem(transaction, (ActivityLifecycleItem) item);
            } else {
                executeNonLifecycleItem(transaction, item,
                        shouldExcludeLastLifecycleState(items, i));
            }
        }
    }

    private void executeLifecycleItem(@NonNull ClientTransaction transaction,
                                      @NonNull ActivityLifecycleItem lifecycleItem) {
        ...
        lifecycleItem.execute(mTransactionHandler, mPendingActions);
                ...
    }

    private void executeNonLifecycleItem(@NonNull ClientTransaction transaction,
                                         @NonNull ClientTransactionItem item, boolean shouldExcludeLastLifecycleState) {
        ...
        item.execute(mTransactionHandler, mPendingActions);
        ...
    }
}
```

`TransactionExecutor` - это как раз класс который работает со всеми транзакциями, то есть с ClientTransactionItem, и ClientTransaction -
который
является массивом или очередью которая хранит ClientTransactionItem-ы,

Конструктор `TransactionExecutor` принимает на вход `ClientTransactionHandler`, если вы не забыли, то ActivityThread реализует абстрактный
класс `ClientTransactionHandler`, по этому фактический в конструктор `TransactionExecutor` прилетает ActivityThread.

У `TransactionExecutor` есть метод `execute` который вызывает другой метод `executeTransactionItems`,
`executeTransactionItems` - в свою очередь пробегается по всем элемента внутри очереди транзакций, то есть в `ClientTransaction`,
и в итоге определяет какой метод вызывать, `executeNonLifecycleItem` или `executeLifecycleItem`.

Различие этих методов в том, что `executeLifecycleItem` вызывается для транзакций, представляющих этапы жизненного цикла активности — такие
как `ResumeActivityItem`, `PauseActivityItem`, `StopActivityItem`, `DestroyActivityItem`. Эти элементы отвечают за переходы между
состояниями уже существующей `Activity`. Их назначение — вызвать соответствующие колбэки (`onPause`, `onStop`, и так далее) на объекте
активности, который уже был создан и существует в памяти.

С другой стороны, `executeNonLifecycleItem` используется для выполнения транзакций, которые **не** относятся к жизненному циклу. Главный
представитель — `LaunchActivityItem`, который отвечает за создание `Activity` с нуля. Это может происходить либо при первом запуске
`Activity`, либо после того, как система уничтожила процесс, и теперь восстанавливает его. Внутри `executeNonLifecycleItem` вызывается
`item.execute(...)`, который, в случае `LaunchActivityItem`, инициирует полную цепочку создания: от `ActivityClientRecord` до вызова
`onCreate`.

Внутри `LaunchActivityItem`, в методе `executeNonLifecycleItem`, мы видим, что у `item` (экземпляр `ClientTransactionItem`) вызывается метод
`execute`, которому передаются `ClientTransactionHandler` и `PendingTransactionActions`. Фактически в этот момент вызывается метод `execute`
у `LaunchActivityItem`. Не забываем, что `LaunchActivityItem` наследуется от `ClientTransactionItem`.

Теперь разберёмся, кто вызывает метод `execute` у `TransactionExecutor`. Это делает внутренний класс `H`, являющийся `Handler`-ом:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    final H mH = new H();
    private final TransactionExecutor mTransactionExecutor = new TransactionExecutor(this);

    class H extends Handler {

        public void handleMessage(Message msg) {
            switch (msg.what) {
                ...
                case EXECUTE_TRANSACTION:
                    final ClientTransaction transaction = (ClientTransaction) msg.obj;
                    final ClientTransactionListenerController controller = ClientTransactionListenerController.getInstance();
                    controller.onClientTransactionStarted();
                    try {
                        mTransactionExecutor.execute(transaction);
                    } finally {
                        controller.onClientTransactionFinished();
                    }
                    ...
                ...
            }
        }
    }
}
```

Напомним, что `ClientTransactionHandler` — это абстрактный класс, от которого наследуется `ActivityThread`. Далее мы видим, что создаётся
объект `H`, а также `TransactionExecutor`, которому в качестве аргумента передаётся `this`, то есть `ActivityThread`, реализующий
`ClientTransactionHandler`.

Теперь обратим внимание на реализацию `handleMessage` внутри класса `H`: когда приходит сообщение с типом `EXECUTE_TRANSACTION`, из объекта
`Message` извлекается `ClientTransaction`, содержащий в себе список (`List`) транзакций. Затем вызывается метод `execute` у
`TransactionExecutor`, что и запускает выполнение транзакции.

Сам метод handleMessage у класса H вызывает методы из самого класса ActivityThread:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    final H mH = new H();

    void sendMessage(int what, Object obj) {
        sendMessage(what, obj, 0, 0, false);
    }

    private void sendMessage(int what, Object obj, int arg1) {
        sendMessage(what, obj, arg1, 0, false);
    }

    private void sendMessage(int what, Object obj, int arg1, int arg2) {
        sendMessage(what, obj, arg1, arg2, false);
    }

    private void sendMessage(int what, Object obj, int arg1, int arg2, boolean async) {
        ...
        mH.sendMessage(msg);
    }
}
```

Видим что последний метод sendMessage и вызывает у класса H метод sendMessage, так как класс H наследуетсч от класса Handler, то у него есть
метод sendMessage и вызывает метод handleMessage, надо понять кто вызывает sendMessage у ActivityThread,

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    void sendMessage(int what, Object obj) {
        sendMessage(what, obj, 0, 0, false);
    }

    private class ApplicationThread extends IApplicationThread.Stub {

        @Override
        public void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
            ActivityThread.this.scheduleTransaction(transaction);
        }
    }
}
```

Этим занимается ApplicationThread, каким образом вызов метода ActivityThread.scheduleTransaction вызывает ActivityThread.sendMessage?

Дело в том что ActivityThread наследуется от ClientTransactionHandler, а ClientTransactionHandler выглядит следующим образом:

```java
public abstract class ClientTransactionHandler {

    void scheduleTransaction(ClientTransaction transaction) {
        transaction.preExecute(this);
        sendMessage(ActivityThread.H.EXECUTE_TRANSACTION, transaction);
    }

    abstract void sendMessage(int what, Object obj);

}
```

Получается у ApplicationThread вызывается метод scheduleTransaction, он вызывает у ActivityThread метод scheduleTransaction который
он унаследовал от ClientTransactionHandler, внутри метода scheduleTransaction у ClientTransactionHandler мы видим что он
вызывает метод sendMessage с двумя параметрами, ActivityThread как раз переопредляет этот метод, и далее вызов идет в H.sendMessage.

ApplicationThread - это Proxy который реализует AIDL интерфейс, этот класс отвечает за многие планирования, например сервисы, receiver
или binding Application. Так же заметьте что он реализует IApplicationThread.Stub, то есть фактический сам AIDL интерфейс IApplicationThread

Дальше поймем откуда происходит вызов метода ApplicationThread.scheduleTransaction, и вуаля, этим занимается класс:

```java
public class ClientTransaction implements Parcelable, ObjectPoolItem {

    private IApplicationThread mClient;

    public void schedule() throws RemoteException {
        mClient.scheduleTransaction(this);
    }
}
```

Он вызывает у ApplicationThread.scheduleTransaction передавая себя, тем самым запланируя себя и свои внутренние транзакций на
выполнение, IApplicationThread это и есть класс ActivityThread.ApplicationThread, далее отследим вызов метода ClientTransaction.schedule(),
встречайте еще один класс,

```java
class ClientLifecycleManager {

    void scheduleTransactionItems(@NonNull IApplicationThread client,
                                  boolean shouldDispatchImmediately,
                                  @NonNull ClientTransactionItem... items) throws RemoteException {
        ...
        final ClientTransaction clientTransaction = getOrCreatePendingTransaction(client);

        final int size = items.length;
        for (int i = 0; i < size; i++) {
            clientTransaction.addTransactionItem(items[i]);
        }

        onClientTransactionItemScheduled(clientTransaction, shouldDispatchImmediately);
    }

    private void onClientTransactionItemScheduled(
            @NonNull ClientTransaction clientTransaction,
            boolean shouldDispatchImmediately) throws RemoteException {
        ...
        scheduleTransaction(clientTransaction);
    }


    void scheduleTransaction(@NonNull ClientTransaction transaction) throws RemoteException {
        ...
        transaction.schedule();
        ...
    }
}
```

Внутри него определён метод `scheduleTransactionItems`, который принимает `IApplicationThread` и массив `ClientTransactionItem`. Этот метод
создаёт или достаёт транзакцию через `getOrCreatePendingTransaction`, добавляет в неё все `ClientTransactionItem` (например,
`LaunchActivityItem`, `ResumeActivityItem`, `PauseActivityItem` и т.д.), после чего передаёт её в метод `onClientTransactionItemScheduled`,
где вызывается`scheduleTransaction`.

После чего управление переходит в метод `scheduleTransaction`, внутри которого вызывается `transaction.schedule()`. А как мы уже знаем,
метод `schedule` вызывает `ApplicationThread.scheduleTransaction`, то есть фактически мы возвращаемся обратно к AIDL-вызову, из которого всё
и
начинается.

Таким образом, `ClientLifecycleManager` собирает транзакцию, наполняет её нужными `ClientTransactionItem`, и отправляет её в исполнение. Это
класс, который формирует цепочку действий, и делегирует выполнение низкоуровневому слою через AIDL.

`ClientLifecycleManager.scheduleTransactionItems` - вызовом метода занимается очень важный класс `ActivityTaskSupervisor`

```java
public class ActivityTaskSupervisor implements RecentTasks.Callbacks {
    ...
    final ActivityTaskManagerService mService;
    ...

    boolean realStartActivityLocked(ActivityRecord r, WindowProcessController proc,
                                    boolean andResume, boolean checkConfig) throws RemoteException {


        // Create activity launch transaction.
        final LaunchActivityItem launchActivityItem = new LaunchActivityItem(r.token,
                ...,r.getSavedState(), r.getPersistentSavedState(), ...,
       );
        ...
        mService.getLifecycleManager().scheduleTransactionItems(
                proc.getThread(),
                // Immediately dispatch the transaction, so that if it fails, the server can
                // restart the process and retry now.
                true /* shouldDispatchImmediately */,
                launchActivityItem, lifecycleItem);
        ...
        return true;
    }
    ...
}
```

Видим очень ключевые моменты:

1. В методе realStartActivityLocked на вход передается объект класса ActivityRecord,
   который в себе хранит значения - r.getSavedState()(Bundle) и r.getPersistentSavedState(PersistentBundle) и прочие важные
   значения и информацию об активити
2. Наконецто видим создание транзакций `LaunchActivityItem` c передачей всех нужных аргументов, в числе и Bundle
3. Видим что у класса ActivityTaskManagerService вызывается метод `getLifecycleManager()` который возвращает объект класса
   `ClientLifecycleManager` и вызывает у него метод scheduleTransactionItems который мы уже видели, с передачей `LaunchActivityItem`

Давай убедимся что метод getLifecycleManager у ActivityTaskManagerService действительно вовзращает ClientLifecycleManager:

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {

    ClientLifecycleManager getLifecycleManager() {
        return mLifecycleManager;
    }
}
```

Убедились, прекрасно, идем дальше, отследим вызов метода `realStartActivityLocked` класса `ActivityTaskSupervisor`

```java
class RootWindowContainer extends WindowContainer<DisplayContent> implements DisplayManager.DisplayListener {

    ActivityTaskSupervisor mTaskSupervisor;
    ActivityTaskManagerService mService;

    boolean attachApplication(WindowProcessController app) throws RemoteException {
        final ArrayList<ActivityRecord> activities = mService.mStartingProcessActivities;
        for (int i = activities.size() - 1; i >= 0; i--) {
            final ActivityRecord r = activities.get(i);
            ...
            if (mTaskSupervisor.realStartActivityLocked(r, app, canResume,
                    true /* checkConfig */)) {
                hasActivityStarted = true;
            }
            ...
            return hasActivityStarted;
        }
    }
}
```

<tip title="RootWindowContainer...">

`RootWindowContainer` — это центральный компонент в системе управления окнами Android,
который содержит в себе всю иерархию окон на всех дисплеях.
Он управляет экземплярами `DisplayContent`, координирует layout, input, фокус, анимации, транзишены, split-screen,
`picture-in-picture` и любые изменения, связанные с конфигурацией экрана.
Всё, что должно появиться, исчезнуть, пересчитаться или анимироваться — сначала проходит через него.
Это точка входа для всех транзакций окон, включая запуск и завершение активностей.

Он настолько крут, что может остановить перезапуск activity, если чувствует, что layout всё ещё "в пути".
Ему не нужно подтверждение от `WindowManagerService` для показа Window и работы с контентом.

`RootWindowContainer` раньше назывался `RootActivityContainer`
</tip>

Видим вызов метода `ActivityTaskSupervisor.realStartActivityLocked` происходит в классе RootWindowContainer, который в методе
`attachApplication`, получает список ActivityRecord у ActivityTaskManagerService, и в цикле для всех вызывает метод
`ActivityTaskSupervisor.realStartActivityLocked`.

Далее мы снова возвращаемся к `ActivityTaskManagerService`, потому что именно он вызывает метод attachApplication у RootWindowContainer
и передает ему

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {
   ...

    /** The starting activities which are waiting for their processes to attach. */
    final ArrayList<ActivityRecord> mStartingProcessActivities = new ArrayList<>();
    RootWindowContainer mRootWindowContainer;

    @HotPath(caller = HotPath.PROCESS_CHANGE)
    @Override
    public boolean attachApplication(WindowProcessController wpc) throws RemoteException {
        ...
        return mRootWindowContainer.attachApplication(wpc);
    }

    void startProcessAsync(ActivityRecord activity, boolean knownToBeDead, boolean isTop,
                           String hostingType) {
         ...
        mStartingProcessActivities.add(activity);
         ...
    }


    ClientLifecycleManager getLifecycleManager() {
        return mLifecycleManager;
    }
   ...
}
```
Видим, что он хранит в себе список `ActivityRecord` в поле `mStartingProcessActivities` — вызов которого мы уже видели в
`RootWindowContainer.attachApplication`.

Далее видим, что у него также есть ссылка на `RootWindowContainer`, и в методе `ActivityTaskManagerService.attachApplication`
происходит вызов метода `RootWindowContainer.attachApplication`.
`startProcessAsync` — также очень важный метод, который добавляет новые `ActivityRecord` в список `mStartingProcessActivities`,
внутри которых хранится `Bundle` (его мы разберём позже).

Выше `ActivityTaskManagerService` находится класс `ActivityManagerService`, он и вызывает `attachApplication` у `ActivityTaskManagerService`:

```java
public class ActivityManagerService extends IActivityManager.Stub {

    public ActivityTaskManagerInternal mAtmInternal;
    final PidMap mPidsSelfLocked = new PidMap();

    @GuardedBy("this")
    private void attachApplicationLocked(@NonNull IApplicationThread thread,
                                         int pid, int callingUid, long startSeq) {
        ...
        finishAttachApplicationInner(startSeq, callingUid, pid);
        ...
    }

    private void finishAttachApplicationInner(long startSeq, int uid, int pid) {
        ...
        final ProcessRecord app;
        app = mPidsSelfLocked.get(pid);
        ...

        didSomething = mAtmInternal.attachApplication(app.getWindowProcessController());
        ...
    }
}
```

Видим в методе `finishAttachApplicationInner` вызов метода `attachApplication` у `mAtmInternal`,
`ActivityTaskManagerInternal`, который является абстрактным AIDL-интерфейсом для `ActivityTaskManagerService`,
поэтому фактически здесь вызывается `ActivityTaskManagerService.attachApplication()`.

Сам метод `finishAttachApplicationInner` вызывается из `attachApplicationLocked`, где процесс извлекается из `mPidsSelfLocked`
по ключу `pid` (то есть process id).

Сам `ActivityManagerService` является синглтоном в рамках всей системы Android, у него внутри есть структура `PidMap`,
которая хранит объекты `ProcessRecord` по ключу `pid`. То есть вызов `mPidsSelfLocked.get(pid)` обращается к `PidMap`:

```java
public class ActivityManagerService extends IActivityManager.Stub {

    final PidMap mPidsSelfLocked = new PidMap();

    ...

    static final class PidMap {
        private final SparseArray<ProcessRecord> mPidMap = new SparseArray<>();

        ProcessRecord get(int pid) {
            return mPidMap.get(pid);
        }
        ...

        void doAddInternal(int pid, ProcessRecord app) {
            mPidMap.put(pid, app);
        }
       ...
    }

    public void setSystemProcess() {
      ...
        ProcessRecord app = mProcessList.newProcessRecordLocked(info, info.processName,
                false,
                0,
                false,
                0,
                null,
                new HostingRecord(HostingRecord.HOSTING_TYPE_SYSTEM));
            ...
        addPidLocked(app);
            ...
    }

    void addPidLocked(ProcessRecord app) {
        final int pid = app.getPid();
        synchronized (mPidsSelfLocked) {
            mPidsSelfLocked.doAddInternal(pid, app);
        }
      ...
    }
}
```

Видим структуру `PidMap`, которая внутри себя хранит список записей процессов приложения.

Также видим методы `setSystemProcess` и `addPidLocked`. В `setSystemProcess` создаётся новый `ProcessRecord` и вызывается
метод `addPidLocked`, который кладёт его в `mPidsSelfLocked`. Метод `setSystemProcess` вызывается из `SystemServer` (он же system\_service).
Ниже краткий стек вызовов:

```
1. Загрузчик (Bootloader) → Ядро (Linux Kernel)  
2. Процесс init (первый userspace-процесс)  
   ├─ Запуск zygote (через app_process)  
   │   ├─ ZygoteInit (singleton, подготавливает среду для Java-процессов)  
   │   │   ├─ fork() → создаёт SystemServer  
   │   │   └─ fork() → создаёт приложения  
   └─ SystemServer (singleton, запускает все системные сервисы)  
       ├─ RuntimeInit (инициализирует среду для SystemServer)  
       └─ ActivityManagerService (singleton, включая `setSystemProcess()`)
```

Выше `ActivityManagerService` подниматься нет смысла, так как там `Bundle` не хранится, большинство этих компонентов
— это синглтоны всей системы и не имеют прямого отношения к конкретному приложению.

На этом моменте уже многое стало ясно: мы рассмотрели очень длинный flow вызовов. Момент, который мы немного пропустили, — где именно создаются `ActivityRecord`. 
Ранее мы уже видели список `ActivityRecord`, получаемый из поля `mStartingProcessActivities` у `ActivityTaskManagerService`:

```java
class RootWindowContainer extends WindowContainer<DisplayContent> implements DisplayManager.DisplayListener {

    ActivityTaskSupervisor mTaskSupervisor;
    ActivityTaskManagerService mService;

    boolean attachApplication(WindowProcessController app) throws RemoteException {
        final ArrayList<ActivityRecord> activities = mService.mStartingProcessActivities;
        for (int i = activities.size() - 1; i >= 0; i--) {
            final ActivityRecord r = activities.get(i);
            ...
            if (mTaskSupervisor.realStartActivityLocked(r, app, canResume,
                    true /* checkConfig */)) {
                hasActivityStarted = true;
            }
            ...
        }
    }
}
```

В `ActivityTaskManagerService` это выглядит следующим образом.
Как мы уже видели, поле `mStartingProcessActivities` является коллекцией, которая хранит объекты `ActivityRecord`.
Есть один метод, который добавляет `ActivityRecord` в эту коллекцию — это метод `startProcessAsync`:

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {
    ...

    /** The starting activities which are waiting for their processes to attach. */
    final ArrayList<ActivityRecord> mStartingProcessActivities = new ArrayList<>();
    RootWindowContainer mRootWindowContainer;

    void startProcessAsync(ActivityRecord activity, boolean knownToBeDead, boolean isTop,
                           String hostingType) {
        ...
        mStartingProcessActivities.add(activity);
        ...
    }
    ...
}
```

Следующая глава статьи будет раскрывать этот момент, где создается ActivityRecord и кто его кладет в ActivityTaskManagerService
в поле mStartingProcessActivities

## Пересоздание процесса с сохранением Bundle

```
ActivityManagerService.startActivity()
  → ActivityTaskManagerService.startActivityAsUser()
    → ActivityStartController.obtainStarter()
      → ActivityStarter.execute()
        → executeRequest():
          1. Создание ActivityRecord (новый объект)
          2. startActivityUnchecked()
             → startActivityInner()
               → setInitialState(r) // сохраняем ActivityRecord в mStartActivity
               → RootWindowContainer.resumeFocusedTasksTopActivities(mStartActivity)
                 → Task.resumeTopActivityUncheckedLocked()
                   → ActivityTaskSupervisor.startSpecificActivity(r)
                     → (если процесс не запущен)
                        → ActivityTaskManagerService.startProcessAsync(r)
                          → mStartingProcessActivities.add(r) // финальная точка
```

`ActivityRecord` (с `Bundle`) умеет переживать смерть процесса или его прерывание. Подразумевается ситуация, когда приложение уходит в фон и
сохраняется в стеке задач (Recents), система через какое-то время убивает процесс.
Когда пользователь возвращается, система вызывает метод `startActivityFromRecents`, чтобы восстановить задачу (Task) и поднять процесс.
Каждая задача, как правило, соответствует одной корневой Activity, но внутри может хранить дочерние Activity, которые тоже связаны с
компонентами.

```java
public class ActivityManagerService extends IActivityManager.Stub {

    @Override
    public final int startActivityFromRecents(int taskId, Bundle bOptions) {
        return mActivityTaskManager.startActivityFromRecents(taskId, bOptions);
    }

}
```

Метод `startActivityFromRecents` внутри `ActivityManagerService` напрямую делегирует вызов в `ActivityTaskManagerService`.
Сам по себе он ничего не делает, просто перекидывает управление дальше.

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {

    ActivityTaskSupervisor mTaskSupervisor;

    @Override
    public final int startActivityFromRecents(int taskId, Bundle bOptions) {
        ...
        return mTaskSupervisor.startActivityFromRecents(callingPid, callingUid, taskId, safeOptions);
    }
}
```

В `ActivityTaskManagerService.startActivityFromRecents` происходит подготовка: извлекаются PID, UID, формируются безопасные опции запуска (
SafeActivityOptions). Далее метод сразу передаёт выполнение в `ActivityTaskSupervisor`, где происходит основная логика обработки задачи.

```java
public class ActivityTaskSupervisor implements RecentTasks.Callbacks {

    final ActivityTaskManagerService mService;
    RootWindowContainer mRootWindowContainer;

    int startActivityFromRecents(int callingPid, int callingUid, int taskId,
                                 SafeActivityOptions options) {
        final Task task;

        task = mRootWindowContainer.anyTaskForId(taskId, MATCH_ATTACHED_TASK_OR_RECENT_TASKS_AND_RESTORE, activityOptions, ON_TOP);

        if (!mService.mAmInternal.shouldConfirmCredentials(task.mUserId) && task.getRootActivity() != null) {
            final ActivityRecord targetActivity = task.getTopNonFinishingActivity();
         ...
            mService.moveTaskToFrontLocked(...);
         ...
            return ActivityManager.START_TASK_TO_FRONT;
        }
    }

}

```

Внутри `startActivityFromRecents` у `ActivityTaskSupervisor` происходит уже настоящий разбор: сначала ищется нужная задача через
`mRootWindowContainer.anyTaskForId(...)`, где передаются различные флаги (например, `MATCH_ATTACHED_TASK_OR_RECENT_TASKS_AND_RESTORE`),
чтобы восстановить задачу из списка недавних.
Затем проверяется, нужно ли подтверждать учётные данные пользователя (например, если включён режим защиты профиля). После этого смотрится,
есть ли у задачи root Activity (`getRootActivity()`), и извлекается верхняя невыполненная Activity через `getTopNonFinishingActivity()`.

Если все условия подходят, вызывается `moveTaskToFrontLocked(...)` у `ActivityTaskManagerService`, который отвечает за перенос задачи в
передний план и дальнейший запуск. Всё это нужно для того, чтобы корректно восстановить состояние приложения из стека задач без
необходимости полного пересоздания Activity с нуля.

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {

    void moveTaskToFrontLocked(@Nullable IApplicationThread appThread,
                               @Nullable String callingPackage, int taskId, ...) {

        final Task task = mRootWindowContainer.anyTaskForId(taskId);
        ...
        mTaskSupervisor.findTaskToMoveToFront(task, flags, ...);
    }

}
```

Метод `moveTaskToFrontLocked` после проверки передаёт управление в `findTaskToMoveToFront`. Здесь задача не просто находится, а
действительно перемещается на передний план. В начале вытаскивается корневой контейнер задачи через `getRootTask()`. Если задача ещё не была
«переподвешена» (reparented), вызывается `moveHomeRootTaskToFrontIfNeeded`, чтобы при необходимости поднять домашнюю задачу (например, если
приложение долго не запускалось).

Далее через `getTopNonFinishingActivity()` достаётся верхняя невыполненная ActivityRecord(Activity) в задаче. Затем вызывается
`currentRootTask.moveTaskToFront`, куда передаётся сама задача, опции анимации и другие параметры

```java
public class ActivityTaskSupervisor implements RecentTasks.Callbacks {

    void findTaskToMoveToFront(Task task, int flags, ActivityOptions options, String reason,
                               boolean forceNonResizeable) {
        Task currentRootTask = task.getRootTask();

        if (!reparented) {
            moveHomeRootTaskToFrontIfNeeded(flags, currentRootTask.getDisplayArea(), reason);
        }

        final ActivityRecord r = task.getTopNonFinishingActivity();
        currentRootTask.moveTaskToFront(task, false /* noAnimation */, options,
                r == null ? null : r.appTimeTracker, reason);
        ...
    }

}
```

В методе `moveTaskToFront` внутри класса `Task` мы видим финальный шаг — вызов `mRootWindowContainer.resumeFocusedTasksTopActivities()`.
Этот вызов отвечает за то, чтобы на уровне контейнера окон (WindowContainer) запустить или возобновить верхнюю активность, сделать её
активной и отрисовать.

```java
class Task extends TaskFragment {

    final void moveTaskToFront(Task tr, boolean noAnimation, ActivityOptions options,
                               AppTimeTracker timeTracker, boolean deferResume, String reason) {
        ...
        mRootWindowContainer.resumeFocusedTasksTopActivities();
    }

}
```

Метод `resumeFocusedTasksTopActivities` у `RootWindowContainer` проходит по всем дисплеям, чтобы определить, какая задача должна быть
запущена или возобновлена. Для каждого дисплея вызывается `forAllRootTasks`, внутри которого берётся верхняя активность (
`topRunningActivity`). Если она уже в состоянии `RESUMED`, то просто выполняется переход приложения (executeAppTransition). В противном
случае активность активируется через `makeActiveIfNeeded`.

Если на дисплее не оказалось ни одной подходящей активности, вызывается `resumeTopActivityUncheckedLocked` у фокусной задачи. А если вообще
нет фокусных задач, система запускает домашнюю Activity через `resumeHomeActivity`.

```java
class RootWindowContainer extends WindowContainer<DisplayContent>
        implements DisplayManager.DisplayListener {

    boolean resumeFocusedTasksTopActivities(
            Task targetRootTask, ActivityRecord target, ActivityOptions targetOptions,
            boolean deferPause) {

        for (int displayNdx = getChildCount() - 1; displayNdx >= 0; --displayNdx) {
            final DisplayContent display = getChildAt(displayNdx);
            final boolean curResult = result;
            boolean[] resumedOnDisplay = new boolean[1];
            final ActivityRecord topOfDisplay = display.topRunningActivity();
            display.forAllRootTasks(rootTask -> {
                final ActivityRecord topRunningActivity = rootTask.topRunningActivity();
                if (!rootTask.isFocusableAndVisible() || topRunningActivity == null) {
                    return;
                }
                if (rootTask == targetRootTask) {
                    resumedOnDisplay[0] |= curResult;
                    return;
                }
                if (topRunningActivity.isState(RESUMED) && topRunningActivity == topOfDisplay) {
                    rootTask.executeAppTransition(targetOptions);
                } else {
                    resumedOnDisplay[0] |= topRunningActivity.makeActiveIfNeeded(target);
                }
            });
            result |= resumedOnDisplay[0];
            if (!resumedOnDisplay[0]) {

                final Task focusedRoot = display.getFocusedRootTask();
                if (focusedRoot != null) {
                    result |= focusedRoot.resumeTopActivityUncheckedLocked(
                            target, targetOptions, false /* skipPause */);
                } else if (targetRootTask == null) {
                    result |= resumeHomeActivity(null /* prev */, "no-focusable-task",
                            display.getDefaultTaskDisplayArea());
                }
            }
        }

        return result;
    }

}
```

Таким образом, когда пользователь возвращается к приложению из Recents, система шаг за шагом поднимает задачу из стека, подготавливает
корневую Activity и доводит её до состояния RESUMED. Всё это происходит последовательно: от поиска задачи в стеке — до финального вызова
`makeActiveIfNeeded`, который, по сути, завершает процесс восстановления.

После того как контейнер окон выбрал задачу для возобновления, управление переходит в метод `resumeTopActivityUncheckedLocked` внутри класса
`Task`.
Здесь вызывается внутренний метод `resumeTopActivityInnerLocked`, который уже окончательно определяет, какую Activity нужно запустить.

```java
class Task extends TaskFragment {

    @GuardedBy("mService")
    boolean resumeTopActivityUncheckedLocked(ActivityRecord prev, ActivityOptions options,
                                             boolean deferPause) {
        someActivityResumed = resumeTopActivityInnerLocked(prev, options, deferPause);
    }

    @GuardedBy("mService")
    private boolean resumeTopActivityInnerLocked(ActivityRecord prev, ActivityOptions options,
                                                 boolean deferPause) {
        final TaskFragment topFragment = topActivity.getTaskFragment();
        resumed[0] = topFragment.resumeTopActivity(prev, options, deferPause);
    }

}
```

В методе `resumeTopActivityInnerLocked` вытаскивается фрагмент задачи (`TaskFragment`), к которому привязана верхняя Activity. Именно тут
начинается конкретная подготовка к запуску компонента приложения.

Дальше вызывается `resumeTopActivity` у `TaskFragment`. Здесь происходит поиск верхней активности (`topRunningActivity`) и запуск метода
`startSpecificActivity`. По сути, `startSpecificActivity` — это последняя точка внутри ядра системы, где принимается решение: запустить
новый процесс для активности или использовать уже существующий.

```java
class TaskFragment extends WindowContainer<WindowContainer> {

    final boolean resumeTopActivity(ActivityRecord prev, ActivityOptions options,
                                    boolean skipPause) {
        ActivityRecord next = topRunningActivity(true /* focusableOnly */);
        mTaskSupervisor.startSpecificActivity(next, true, false);
        ...
        return true;
        ...
    }

}
```

Далее метод `startSpecificActivity` внутри `ActivityTaskSupervisor`. Здесь анализируется состояние процесса: если процесс уже существует и
привязан, то активити будет сразу запущена. Если же процесс отсутствует или был завершён системой, тогда вызывается `startProcessAsync`,
чтобы создать новый процесс для этой активности.

```java
public class ActivityTaskSupervisor implements RecentTasks.Callbacks {
    ...
    final ActivityTaskManagerService mService;

    void startSpecificActivity(ActivityRecord r, boolean andResume, boolean checkConfig) {
        ...
        mService.startProcessAsync(r, knownToBeDead, isTop,
                isTop ? HostingRecord.HOSTING_TYPE_TOP_ACTIVITY
                        : HostingRecord.HOSTING_TYPE_ACTIVITY);
    }
}
```

В методе `startProcessAsync` активити добавляется в список `mStartingProcessActivities`. Это своего рода «очередь на запуск», куда система
кладёт активности, пока ожидает, что процесс для них будет создан и привязан.

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {
    ...

    final ArrayList<ActivityRecord> mStartingProcessActivities = new ArrayList<>();
    RootWindowContainer mRootWindowContainer;

    void startProcessAsync(ActivityRecord activity, boolean knownToBeDead, boolean isTop,
                           String hostingType) {
        ...
        mStartingProcessActivities.add(activity);
        ...
    }
    ...
}
```

Таким образом, когда мы доходим до финальной стадии, встает важный вопрос: **где в конечном итоге хранится `ActivityRecord` и как устроены
связи между ключевыми сущностями — `DisplayContent`, `WindowContainer`, `Task` (и `TaskFragment`)?** Это поможет окончательно понять, как
именно система управляет состоянием и «жизнью» Activity на стороне System Server.

**Общая структура иерархии**
Android управляет активностями и окнами в виде **иерархического дерева контейнеров**, где каждый контейнер реализован через базовый класс
`WindowContainer`. Вся структура начинается с корневого контейнера `RootWindowContainer`, внутри которого для каждого физического или
виртуального дисплея создается `DisplayContent`.

**DisplayContent**
`DisplayContent` представляет отдельный физический или виртуальный дисплей. Он является прямым потомком `RootWindowContainer` и внутри себя
хранит так называемые **DisplayAreas**, в которых сегментируются разные типы окон (например, область приложений, область системных оверлеев
и т.д.). Внутри DisplayContent находится **TaskDisplayArea**, которая отвечает за размещение пользовательских задач (Tasks).

**TaskDisplayArea**
`TaskDisplayArea` — это область дисплея, куда добавляются задачи (`Task`). В большинстве случаев, если нет multi-window или особых режимов,
используется один **DefaultTaskDisplayArea**, где и размещаются все задачи приложения. В иерархии путь выглядит так: **DisplayContent →
TaskDisplayArea → Task**.

**Task**
`Task` (по сути, «стек задач») группирует одну или несколько активити, которые пользователь воспринимает как одно приложение в списке
Recents. В Android `Task` наследуется от `TaskFragment`, что делает его контейнером, способным содержать дочерние `WindowContainer`. Обычно
внутри задачи размещаются именно `ActivityRecord`, каждая из которых представляет конкретную активити. В более сложных случаях, например при
split-screen, `Task` может содержать и другие задачи или TaskFragments. Однако в стандартном сценарии (одиночный экран без split) задача
содержит список ActivityRecords напрямую.

*Здесь ключевой момент*: **`Task` является прямым родителем для `ActivityRecord`**. Это значит, что все состояния и контекст конкретной
Activity хранятся внутри её `ActivityRecord`, который в свою очередь всегда находится внутри задачи. Таким образом, при возврате
пользователя к приложению через Recents, система восстанавливает задачу, а вместе с ней и все вложенные ActivityRecords.

**TaskFragment**
`TaskFragment` — это базовый класс, который используется для создания под-контейнеров внутри задачи. В обычных сценариях мы его напрямую не
видим, потому что работаем с `Task`, который уже является расширением `TaskFragment`. В некоторых режимах (например, Activity Embedding)
могут создаваться отдельные TaskFragments, чтобы разделить экран между несколькими активити. Но если таких сценариев нет, `Task` сам по себе
содержит ActivityRecords, и дополнительных TaskFragments не используется.

**ActivityRecord**
`ActivityRecord` представляет конкретный экземпляр Activity в системе. Он наследуется от `WindowToken`, который в свою очередь является
дочерним классом `WindowContainer`. Таким образом, `ActivityRecord` — это одновременно и контейнер для окон активити, и токен, который
WindowManager использует для управления окнами. Обычно внутри `ActivityRecord` размещается один основной `WindowState` (окно приложения), а
также любые дочерние окна (например, диалоги).

**Путь в иерархии выглядит так**:
`RootWindowContainer → DisplayContent → TaskDisplayArea → Task → ActivityRecord → WindowState`.

Это означает, что `ActivityRecord` **всегда живёт внутри задачи** и никогда не существует сам по себе или в глобальном списке. Именно
поэтому при возврате из Recents задача сначала поднимается целиком (`Task`), а затем уже внутри неё активируются нужные активности (
`ActivityRecord`).

Такое дерево контейнеров позволяет системе Android централизованно управлять всей иерархией окон и задач. Например, при изменении
конфигурации или выгрузке процесса, состояние активности остаётся «привязанным» к её `ActivityRecord`, который живёт внутри `Task`. Когда
задача возвращается на экран, все объекты дерева последовательно восстанавливаются, и Activity получает свои данные обратно через `Bundle`,
связанный с её `ActivityRecord`.

Сделаем краткий итог

* **DisplayContent** — верхний контейнер для дисплея, включает TaskDisplayArea.
* **TaskDisplayArea** — область дисплея для задач.
* **Task** — контейнер, группирующий одну или несколько ActivityRecords.
* **TaskFragment** — промежуточный контейнер, используется при embedding или split, обычно не нужен в базовом сценарии.
* **ActivityRecord** — контейнер и токен конкретной Activity, всегда находится внутри Task.
* **WindowState** — дочерние окна Activity, живут внутри ActivityRecord.

Таким образом, вопрос *«где хранится ActivityRecord»* можно чётко ответить: **внутри Task**, как дочерний элемент в дереве контейнеров.

Эта архитектура делает поведение задач предсказуемым и позволяет системе сохранять, приостанавливать и восстанавливать активности, не
нарушая общую структуру приложения в памяти. Именно поэтому пользователь всегда видит «цельную» задачу в Recents, а не отдельные активности.


> Для более наглядного понимания иерархии можно посмотреть диаграмму ниже, которая отлично иллюстрирует дерево контейнеров в Android
> WindowManager (начиная с Android 12).
>
> ![Android WindowManager Hierarchy](https://cdn.jsdelivr.net/gh/b0xt/sobyte-images/2022/02/15/8e302de71ed649b7aab54919ae455e61.png)
>
> *Диаграмма взята
с [sobyte.net — Android 12 WMS Hierarchy](https://www.sobyte.net/post/2022-02/android-12-wms-hierarchy/#:~:text=%2A%20RootWindowContainer%3A%20The%20top,%E2%80%A6)
для иллюстрации иерархии WindowManager.*

## Где и когда создается ActivityRecord в первые

После того как мы разобрали, где именно хранится `ActivityRecord` в иерархии контейнеров, возникает следующий важный вопрос: **а когда и как
этот объект вообще появляется в системе?**

Все предыдущие главы показывали нам, как система управляет уже существующими `ActivityRecord` — как они восстанавливаются из стека задач (
Recents), как переходят между состояниями, как сохраняются их состояния. Но откуда берётся первый экземпляр `ActivityRecord`, когда Activity
запускается впервые, например, при самом первом запуске приложения или при старте новой Activity через интент?

Именно этот момент — создание `ActivityRecord` — можно считать точкой входа активности в «жизнь» на стороне system server.
На этом этапе создаётся основная структура, к которой в дальнейшем будут привязаны всё: и окна (`WindowState`), и состояния (`Bundle`), и
привязки к задаче (`Task`).

Дальше система начинает «разворачивать» процесс по цепочке вызовов, начиная с верхнего уровня — `ActivityManagerService`.
Когда приложение или другой компонент системы вызывает `startActivity(...)`, эта команда сначала попадает в публичный API
`ActivityManagerService`, а уже оттуда прокладывает путь вниз через слои system server, где и подготавливаются все объекты, необходимые для
старта.

Вот как выглядит эта цепочка вызовов на первых уровнях:

```java
public class ActivityManagerService extends IActivityManager.Stub,...{

@Override
public int startActivityWithFeature(IApplicationThread caller, String callingPackage,...) {
    return mActivityTaskManager.startActivity(caller, callingPackage, callingFeatureId, intent,...);
}

}
```

Здесь `ActivityManagerService` лишь перенаправляет вызов в `ActivityTaskManagerService`, где начинается более детальная работа с профилями
пользователей, флагами интентов и прочими проверками.

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {

    @Override
    public final int startActivity(IApplicationThread caller, String callingPackage, ...) {
        return startActivityAsUser(caller, callingPackage, callingFeatureId, intent, ...);
    }

    private int startActivityAsUser(IApplicationThread caller, String callingPackage, ...) {

        return getActivityStartController().obtainStarter(intent, "startActivityAsUser")
              ...
              .execute();
    }

    ActivityStartController getActivityStartController() {
        return mActivityStartController;
    }

}
```

В методе `startActivityAsUser` мы уже видим обращение к `ActivityStartController`, который управляет процессом создания и конфигурации
старта активности.
Метод `obtainStarter` возвращает объект `ActivityStarter`, который можно назвать настоящим «дирижёром» запуска. Он собирает все параметры,
проверяет, нужна ли новая задача (`Task`) или можно использовать существующую, проверяет конфигурацию и наконец подготавливает
`ActivityRecord`.

```java
public class ActivityStartController {

    ActivityStarter obtainStarter(Intent intent, String reason) {
        return mFactory.obtain().setIntent(intent).setReason(reason);
    }
}
```

После того как мы получаем `ActivityStarter` через `obtainStarter`, именно здесь происходит создание нового объекта `ActivityRecord`.
`ActivityStarter` формирует все ключевые параметры запуска: интент, флаги, целевой `Task`, конфигурацию окна, а также решает, нужно ли
создать новую задачу или использовать существующую.

Созданный `ActivityRecord` связывается с задачей, добавляется в иерархию контейнеров и становится частью общей структуры
`RootWindowContainer`.
После создания `ActivityRecord` хранится в дереве контейнеров до завершения активности или её удаления системой.

---

```java
class ActivityStarter {

    private final ActivityTaskManagerService mService;
    private final RootWindowContainer mRootWindowContainer;
    ActivityRecord mStartActivity;

    int execute() {
        ...
        res = executeRequest(mRequest);
        ...
    }

    private int executeRequest(Request request) {
        final ActivityRecord r = new ActivityRecord.Builder(mService)
                 ... // параметры через билдер
                .build();

        mLastStartActivityResult = startActivityUnchecked(r, ...);
        ...
    }

    private int startActivityUnchecked(final ActivityRecord r, ...) {
        ...
        result = startActivityInner(r, ...);
        ...
    }

    int startActivityInner(final ActivityRecord r, ...) {
        setInitialState(r, ...);

        mRootWindowContainer.resumeFocusedTasksTopActivities(
                mTargetRootTask, mStartActivity, mOptions, mTransientLaunch);
    }

    private void setInitialState(ActivityRecord r, ...) {
        ...
        mStartActivity = r;
        ...
    }
}
```

В методе `executeRequest` через билдер создаётся объект `ActivityRecord`. После инициализации передаётся в `startActivityUnchecked`, а затем
в `startActivityInner`, где вызывается метод `setInitialState`. Здесь объект сохраняется в `mStartActivity` — это ссылка на текущую
активность, которая будет запущена.

Далее активити подготавливается к запуску через вызов `resumeFocusedTasksTopActivities` у `RootWindowContainer`.

---

```java
class RootWindowContainer extends WindowContainer<DisplayContent>
        implements DisplayManager.DisplayListener {

    boolean resumeFocusedTasksTopActivities(
            Task targetRootTask, ActivityRecord target, ActivityOptions targetOptions,
            boolean deferPause) {

        for (int displayNdx = getChildCount() - 1; displayNdx >= 0; --displayNdx) {
            final DisplayContent display = getChildAt(displayNdx);
            final boolean curResult = result;
            boolean[] resumedOnDisplay = new boolean[1];
            final ActivityRecord topOfDisplay = display.topRunningActivity();
            display.forAllRootTasks(rootTask -> {
                final ActivityRecord topRunningActivity = rootTask.topRunningActivity();
                if (!rootTask.isFocusableAndVisible() || topRunningActivity == null) {
                    return;
                }
                if (rootTask == targetRootTask) {
                    resumedOnDisplay[0] |= curResult;
                    return;
                }
                if (topRunningActivity.isState(RESUMED) && topRunningActivity == topOfDisplay) {
                    rootTask.executeAppTransition(targetOptions);
                } else {
                    resumedOnDisplay[0] |= topRunningActivity.makeActiveIfNeeded(target);
                }
            });
            result |= resumedOnDisplay[0];
            if (!resumedOnDisplay[0]) {
                final Task focusedRoot = display.getFocusedRootTask();
                if (focusedRoot != null) {
                    result |= focusedRoot.resumeTopActivityUncheckedLocked(
                            target, targetOptions, false /* skipPause */);
                } else if (targetRootTask == null) {
                    result |= resumeHomeActivity(null /* prev */, "no-focusable-task",
                            display.getDefaultTaskDisplayArea());
                }
            }
        }

        return result;
    }
}
```

В методе `resumeFocusedTasksTopActivities` происходит обход всех дисплеев и корневых задач. Для каждой задачи выбирается верхняя активити,
проверяется её состояние и возможность активации. Если задача содержит целевую активити (`target`), она активируется вызовом
`resumeTopActivityUncheckedLocked`.

Таким образом, после создания `ActivityRecord`, система полностью подготавливает задачу и активирует верхнюю активити, переводя её в
состояние RESUMED.
Отлично, продолжим ровно в том же техническом, «ровном» стиле, учитывая, что эти методы мы действительно уже подробно разбирали ранее.

После того как контейнер окон выбрал задачу для возобновления, управление переходит в метод `resumeTopActivityUncheckedLocked` внутри класса
`Task`.
Мы уже встречали этот метод раньше — он отвечает за выбор и финальную подготовку верхней активити внутри задачи перед запуском. Внутри него
вызывается `resumeTopActivityInnerLocked`, который в свою очередь извлекает нужный `TaskFragment`.

```java
class Task extends TaskFragment {

    @GuardedBy("mService")
    boolean resumeTopActivityUncheckedLocked(ActivityRecord prev, ActivityOptions options,
                                             boolean deferPause) {
        someActivityResumed = resumeTopActivityInnerLocked(prev, options, deferPause);
    }

    @GuardedBy("mService")
    private boolean resumeTopActivityInnerLocked(ActivityRecord prev, ActivityOptions options,
                                                 boolean deferPause) {
        final TaskFragment topFragment = topActivity.getTaskFragment();
        resumed[0] = topFragment.resumeTopActivity(prev, options, deferPause);
    }

}
```

Как мы помним, в методе `resumeTopActivityInnerLocked` вытаскивается верхний фрагмент задачи (объект `TaskFragment`), который содержит
активити, готовую к запуску.

Далее вызывается `resumeTopActivity` у `TaskFragment`. Этот метод ищет верхнюю активити в контейнере (`topRunningActivity`) и инициирует
вызов `startSpecificActivity`. Здесь принимается решение, нужно ли запускать новый процесс или использовать уже существующий.

```java
class TaskFragment extends WindowContainer<WindowContainer> {

    final boolean resumeTopActivity(ActivityRecord prev, ActivityOptions options,
                                    boolean skipPause) {
        ActivityRecord next = topRunningActivity(true /* focusableOnly */);
        mTaskSupervisor.startSpecificActivity(next, true, false);
        ...
        return true;
        ...
    }

}
```

Мы уже видели метод `startSpecificActivity` внутри `ActivityTaskSupervisor` в предыдущих главах.
Он проверяет, существует ли уже процесс для текущей активности. Если процесс жив и активити привязана, то система продолжает её запуск
напрямую. Если процесс отсутствует или был выгружен системой, вызывается метод `startProcessAsync`, который отвечает за асинхронный старт
нового процесса.

```java
public class ActivityTaskSupervisor implements RecentTasks.Callbacks {
    ...
    final ActivityTaskManagerService mService;

    void startSpecificActivity(ActivityRecord r, boolean andResume, boolean checkConfig) {
        ...
        mService.startProcessAsync(r, knownToBeDead, isTop,
                isTop ? HostingRecord.HOSTING_TYPE_TOP_ACTIVITY
                        : HostingRecord.HOSTING_TYPE_ACTIVITY);
    }
}
```

Внутри `startProcessAsync`, как мы уже подробно разбирали, активити добавляется в список `mStartingProcessActivities`.
Это очередь для тех активити, которые ждут, пока процесс будет создан и привязан системой. Такая очередь позволяет системе контролировать
порядок запуска и управлять ресурсами без потерь состояний.

```java
public class ActivityTaskManagerService extends IActivityTaskManager.Stub {
    ...

    final ArrayList<ActivityRecord> mStartingProcessActivities = new ArrayList<>();
    RootWindowContainer mRootWindowContainer;

    void startProcessAsync(ActivityRecord activity, boolean knownToBeDead, boolean isTop,
                           String hostingType) {
        ...
        mStartingProcessActivities.add(activity);
        ...
    }
    ...
}
```

Таким образом, вся эта цепочка методов, которые мы уже встречали ранее, замыкается именно здесь: от вызова из контейнеров окон до финального
решения о создании нового процесса или продолжении в текущем.
В результате создаётся, сохраняется и активируется `ActivityRecord`, и именно он становится ключевым звеном между системой и
пользовательским интерфейсом.
Что происходит после вызова этого метода и последующую логику обработки мы уже подробно разбирали в предыдущих главах.

На этом, пожалуй, всё — это конец статьи.

