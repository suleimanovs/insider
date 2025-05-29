Это продолжение трех предыдущих статей.

### Введение

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`,
2. Во второй — как это устроено во `Fragment`,
3. В третьей где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).

В этой статье рассмотрим Где хранится SavedStateHandle, проверим SavedStateHandle vs onSaveInstanceState vs ViewModel(ViewModelStore)
Поймем связку SavedStateHandle с ViewModel . Но, как всегда, начнём с базиса.

### Базис

В статье не будет описания как работать с этими Api, а будет о том как они работают изнутри, по этому я буду пологаться на то
что вы уже работали с ними.
Как всегда начнем с базиса, давайте сначала дадим определения для SavedStateHandle, onSaveInstanceState, ViewModel:

**ViewModel** - компонент архитектурного паттерна MVVM, который был предоставлен Google как примитив
позволяющий пережить изменение конфигураций. Изменение конфигураций в свою очередь - это состояние, заставляющая
activity/fragment пересоздаваться, это именно то состояние которое может пережить ViewModel.
Увы на этом обьязанности ViewModel по хранению данных в контексте android заканчивается

Если proccess приложения умирает или прырывается proccess , то в таком случае ViewModel не справится,
по этому тут в дело входит старые добрые методы onSaveInstanceState/onRestoreInstanceState

**onSaveInstanceState/onRestoreInstanceState** — это методы жизненного цикла Activity, Fragment и View(да View тоже может сохронять
состояние)
которые позволяют сохранять и восстанавливать временное состояние пользовательского интерфейса при изменениях конфигурации (например, при
повороте экрана)
или при полном уничтожении активности из-за нехватки ресурсов.
В onSaveInstanceState данные сохраняются в Bundle, который автоматически передаётся в метод onRestoreInstanceState при восстановлении
активности.

Это базовый механизм для хранения состояния примитивных(и их массивы) типов данных, Parcelable/ Serializeble и еще пару нативных андроид
типов, эти методы требуют явного указания того, что именно нужно сохранить, плюс логика прописывается внутри Activity и Fragment.
Большинство архитектурных паттернов MVI, MVVM гласят что View(Fragment/Activity/Compose) должны быть максимально простыми и не содержать
какую либо логику помимо отбражения данных, по этому прямое использование этих методов в последнее время отпадает с появлением Saved State
Api
которая хорошо интегрируется с ViewModel наделяя ViewModel не только спасать данные от изменений конфигураций, но и вохможностью
спасать сериализуемых данных от уничтожения/остановки процесса по инициативе системы.

**SavedState API** — это современная альтернатива методам onSaveInstanceState/onRestoreInstanceStat,
которая более гибко управляет состоянием, особенно в связке с ViewModel.
**SavedStateHandle** — это объект, предоставленный в конструкторе ViewModel, который позволяет безопасно сохранять и восстанавливать данные,
даже если процесс был уничтожен. В отличие от статичного использования onSaveInstanceState, SavedStateHandle предоставляет так же
возможность
подписаться на Flow, LiveData данные которые он хранит и восстанавливает.
Он автоматически интегрирован с ViewModel и поддерживает сохранение состояния при изменениях конфигурации, а также при полном уничтожении
приложения(процесса).
Дополнительное преимущество — это возможность подписываться на изменения значений в SavedStateHandle, получая реактивное поведение прямо в
ViewModel.

<tip> Под уничтожением или прерыванием процесса, о котором идёт речь в статье, подразумевается ситуация, когда приложение находится 
в фоне и сохраняется в стеке задач. 

Обычно это происходит, когда пользователь сворачивает приложение, не закрывая его. Через некоторое время бездействия система может
остановить процесс.
Не стоит путать это с кейсом, когда пользователь сам вручную закрывает приложение — это другой сценарий.
</tip>

### onSaveInstanceState/ onRestoreInstanceState

Давайте так же освижим память о методах onSaveInstanceState/ onRestoreInstanceState:

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

**onSaveInstanceState** — вызывается для получения состояния Activity перед её уничтожением, чтобы это состояние могло быть
восстановлено в методах `onCreate` или `onRestoreInstanceState`. `Bundle`, заполненный в этом методе, будет передан в оба метода.

Этот метод вызывается перед тем, как активность может быть уничтожена, чтобы в будущем, при повторном создании, она могла восстановить своё
состояние. Не следует путать этот метод с методами жизненного цикла, такими как `onPause`, который всегда вызывается, когда пользователь
больше не взаимодействует с активностью, или `onStop`, который вызывается, когда активность становится невидимой. Пример, когда `onPause` и
`onStop`
вызываются, но `onSaveInstanceState` — нет: пользователь возвращается из Activity B в Activity A — в этом случае состояние B не требуется
восстанавливать, поэтому `onSaveInstanceState` для B не вызывается. Другой пример: если Activity B запускается поверх Activity A, но A
остаётся в памяти, то `onSaveInstanceState` для A также не вызывается, так как его состояние остаётся неизменным.

Реализация по умолчанию этого метода автоматически сохраняет большую часть состояния пользовательского интерфейса, вызывая метод
`onSaveInstanceState()` у каждого представления (`View`) в иерархии, у которого есть ID, и сохраняя ID элемента, который был в фокусе.
Восстановление этих данных будет происходить в стандартной реализации метода `onRestoreInstanceState()`. Если метод переопределяется для
сохранения дополнительной информации, которая не захвачена отдельными представлениями, рекомендуется вызвать реализацию по умолчанию через
`super.onSaveInstanceState(outState)`. В противном случае разработчику придётся вручную сохранять состояние всех представлений.

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
 *
 * required to act as a source input for a [SavedStateReader] or [SavedStateWriter].
 *
 * This class represents a container for persistable state data. It is designed to be
 * platform-agnostic, allowing seamless state saving and restoration across different environments.
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
используется
класс `Bundle`, и ничто нам не мешает не использовать двойную обертку, а напрямую вернуть сам `Bundle`:

```kotlin
savedStateRegistry.registerSavedStateProvider(
    key = "counter_key",
    provider = object : SavedStateRegistry.SavedStateProvider {
        override fun saveState(): SavedState {
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

Но откуда береться `savedStateRegistry` переменная внутри `Activity` мы рассмотрим позже, пока достаточно знать
что он есть у `Activity`, далее исходники метода `registerSavedStateProvider` и `consumeRestoredStateForKey` пренадлежащий классу
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
Также мы рассмотрели исходники интерфейса `SavedStateProvider`, который представляет собой коллбэк для получения `Bundle`, подлежащего
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

    private val lock = SynchronizedObject()
    private val keyToProviders = mutableMapOf<String, SavedStateProvider>()
    private var attached = false
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
        synchronized(lock) {
            require(key !in keyToProviders) {
                "SavedStateProvider with the given key is already registered"
            }
            keyToProviders[key] = provider
        }
    }
    ...
}
```

Основные методы для сохранения, давайте просто поймем что здесь происходит:

1. `consumeRestoredStateForKey` - достает значение из `restoredState`(Bundle) по ключу, после того как достает значение,
   удаляет из `restoredState`(Bundle) значение и ключ, `restoredState` является самым коренным `Bundle` который внутри себя хранит все
   другие
   bundle
2. `registerSavedStateProvider` - просто добавляет объеки `SavedStateProvider` внутрь карты `keyToProviders`

Эти методы — очень верхнеуровневые и не раскрывают, как именно в итоге сохраняются данные, поэтому нужно копнуть глубже — внутри этого же
класса `SavedStateRegistryImpl`:

```kotlin
internal class SavedStateRegistryImpl(
    private val owner: SavedStateRegistryOwner,
    internal val onAttach: () -> Unit = {},
) {
    private val lock = SynchronizedObject()
    private val keyToProviders = mutableMapOf<String, SavedStateProvider>()
    private var attached = false
    private var restoredState: SavedState? = null

    /** An interface for an owner of this [SavedStateRegistry] to restore saved state. */
    @MainThread
    internal fun performRestore(savedState: SavedState?) {
        ...
        restoredState =
            savedState?.read {
                if (contains(SAVED_COMPONENTS_KEY)) getSavedState(SAVED_COMPONENTS_KEY) else null
            }
        isRestored = true
    }

    /**
     * An interface for an owner of this [SavedStateRegistry] to perform state saving, it will call
     * all registered providers and merge with unconsumed state.
     *
     * @param outBundle SavedState in which to place a saved state
     */
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
   по
   ключу `SAVED_COMPONENTS_KEY`, если оно существует. Найденное значение (вложенный `SavedState`) сохраняется в переменную `restoredState`,
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
`SavedStateRegistryController`. Также видим метод `create`, который создаёт `SavedStateRegistryImpl`, передаёт его в конструктор
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
* `Fragment` — любой `Fragment` также реализует этот интерфейс.

```java
public class Fragment implements ...SavedStateRegistryOwner,...{

SavedStateRegistryController mSavedStateRegistryController;

    ...

@NonNull
@Override
public final SavedStateRegistry getSavedStateRegistry() {
    return mSavedStateRegistryController.getSavedStateRegistry();
}
    ...
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
        // Restore the Saved State first so that it is available to
        // OnContextAvailableListener instances
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

Тут на первый взгляд можно ожидать, что будет краш при запуске приложения, так как если `ViewModel` на вход принимает какой-либо параметр, то
нужна фабрика `ViewModel`, он же `ViewModelProvider.Factory`, где мы вручную должны каким-то образом положить требуемый параметр в конструктор.
И в нашем примере конструктор не пустой, но если мы запустим этот код, то никакого краша и ошибки не будет, всё запустится и
инициализируется должным образом. Почему так?

Разработчики из google знали что часто понадобиться передавать `SavedStateHandle` в `ViewModel`, и что бы разработчикам не приходилось каждый
раз создавать фабрику для передачи - имеется готовая фабрика которая работает под капотом, так же имеются готовые классы вроде

`AbstractSavedStateViewModelFactory` - начиная с lifecycle-viewmodel-savedstate-android-**2.9.0** - обьявлен устаревшим
`SavedStateViewModelFactory` - актуален на данный момент для создания ViewModel с SavedStateHandle

Давайте теперь посмотрим как это работает на уровне `Activity`, логику `ViewModelProvider/ViewModel` мы уже рассматривали, сейчас просто пройдемся
по интересующей нас теме, когда мы обращаемся к `ViewModelProvider.create`:

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
        } else {
            val viewModel =
                if (lifecycle != null) {
                    create(key, modelClass) // legacy way
                } else {
                    throw IllegalStateException(
                        "SAVED_STATE_REGISTRY_OWNER_KEY and" +
                                "VIEW_MODEL_STORE_OWNER_KEY must be provided in the creation extras to" +
                                "successfully create a ViewModel."
                    )
                }
            viewModel
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

Тут сокращена логика из исходников что бы сосредоточиться на главном, внутри метода create у фабрики проверяется имеют ли extras
поля c ключами SAVED_STATE_REGISTRY_OWNER_KEY и VIEW_MODEL_STORE_OWNER_KEY, если имеется, до дальше происходит
вызов метода newInstance которая через рефлексию вызывает конструктор и передает параметры одним из которых является SavedStateHandle,
но интерусующая часть, Обратим внимание на вызов createSavedStateHandle():

```kotlin
newInstance(modelClass, constructor, extras.createSavedStateHandle())
```

Что происходит внутри createSavedStateHandle?

Для того чтобы понять, как создаётся SavedStateHandle, необходимо заглянуть в исходный код метода:

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
SavedStateHandle
для данной ViewModel.

```kotlin

private fun createSavedStateHandle(
    savedStateRegistryOwner: SavedStateRegistryOwner,
    viewModelStoreOwner: ViewModelStoreOwner,
    key: String,
    defaultArgs: SavedState?
): SavedStateHandle {
    val provider = savedStateRegistryOwner.savedStateHandlesProvider
    val viewModel = viewModelStoreOwner.savedStateHandlesVM
    // If we already have a reference to a previously created SavedStateHandle
    // for a given key stored in our ViewModel, use that. Otherwise, create
    // a new SavedStateHandle, providing it any restored state we might have saved
    return viewModel.handles[key]
        ?: SavedStateHandle.createHandle(provider.consumeRestoredStateForKey(key), defaultArgs)
            .also { viewModel.handles[key] = it }
}
```

Тут сначала ищеться нужный SavedStateHandle внутри SavedStateHandlesVM, если не найдено то происходит создание SavedStateHandle, он кладется
в SavedStateHandlesVM для хранение, и фукнция createSavedStateHandle возвращает
управление обратно другой фукнций CreationExtras.createSavedStateHandle() которую мы уже видели, и в конечном итоге управление возрващается
в factory, таким образом создается SavedStateHandle для конкретной ViewModel.

Так же в этом методе видим некие вызовы вроде `savedStateRegistryOwner.savedStateHandlesProvider` и
` viewModelStoreOwner.savedStateHandlesVM`

Переход к провайдеру: savedStateHandlesProvider

Теперь посмотрим, как это связано с провайдером. В коде вызывается savedStateRegistryOwner.savedStateHandlesProvider.
На самом деле это просто extension, который вытаскивает объект(SavedStateProvider) из SavedStateRegistry:

Этот провайдер ответственен за доступ ко всем сохранённым состояниям(SavedStateHandle) которые привязаны к разным ViewModel-кам

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
            // Ensure that even if ViewModels aren't recreated after process death and
            // recreation
            // that we keep their state until they are recreated
            restoredState?.let { putAll(it) }
            // But if we do have ViewModels, prefer their state over what we may
            // have restored
            viewModel.handles.forEach { (key, handle) ->
                val savedState = handle.savedStateProvider().saveState()
                if (savedState.read { !isEmpty() }) {
                    putSavedState(key, savedState)
                }
            }

            // After we've saved the state, allow restoring a second time
            restored = false
        }
    }

    /** Restore the state from the SavedStateRegistry if it hasn't already been restored. */
    fun performRestore() {
        ...
    }

    /** Restore the state associated with a particular SavedStateHandle, identified by its [key] */
    fun consumeRestoredStateForKey(key: String): SavedState? {
        ...
    }
}
``` 

Взаимодействие с SavedStateHandlesVM

Теперь перейдём к тому, как данные хранятся внутри ViewModel. savedStateHandlesVM — это расширение, которое создаёт или восстанавливает
объект SavedStateHandlesVM, хранящий в себе мапу из ключей на SavedStateHandle:

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

Здесь создаётся объект SavedStateHandlesVM, внутри которого поддерживается Map, связывающая ключи с объектами SavedStateHandle.
SavedStateHandlesVM - нужен для того что бы хранить и управлять всеми SavedStateHandle всех ViewModel-ей в рамках одного ViewModelStoreOwner
и SavedStateRegisrtyOwner.
SavedStateHandlesProvider - класс реализующий интерфейс SavedStateProvider, когда SavedStateController вызывает performSave,
тогда он так же обращается к SavedStateHandlesProvider и вызывает его метод saveState, далее он кладет все существующие SavedStateHandle
в объект SaveState(Bundle) и возвращает его, но что бы все этот процесс работал, нужно что бы регистрировали SavedStateHandlesProvider
у SavedStateRegsitry, но пока что мы в коде не встретили блок кода который отвечал бы за регистрацию providera, то есть
посредством вызова метода: `savedStateRegistry.registerSavedStateProvider`, на самом деле такая логика есть, и она трегириться
в ComponentActivity/Fragment/NavbackStackEntry - то есть во всех SavedStateRegistryOwner-ов, давайте просто глянем как это вызывается
в ComponentActivity:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    init {
        ...
        enableSavedStateHandles()
        ...
    }
}
```

Видим вызов некого метода `enableSavedStateHandles` - самое название звучит заманчиво, далее исхожники метода enableSavedStateHandles:

```kotlin

@MainThread
public fun <T> T.enableSavedStateHandles() where T : SavedStateRegistryOwner, T : ViewModelStoreOwner {
    ...
    // Add the SavedStateProvider used to save SavedStateHandles
    // if we haven't already registered the provider
    if (savedStateRegistry.getSavedStateProvider(SAVED_STATE_KEY) == null) {
        val provider = SavedStateHandlesProvider(savedStateRegistry, this)
        savedStateRegistry.registerSavedStateProvider(SAVED_STATE_KEY, provider)
        lifecycle.addObserver(SavedStateHandleAttacher(provider))
    }
}
```

enableSavedStateHandles - типизированный метод который требует что бы вызывающая область являлась одновременно как SavedStateRegistryOwner
так и ViewModelStoreOwner, ComponentActivity/Fragment/NavbackStackEntry идеально подходят для этого, все трое одновременно реализуют
интерфейсы SavedStateRegistryOwner и ViewModelStoreOwner, давайте в кратце поймем что происходит в этом методе,
для начала у SavedStateRegistry запрашивается сохроненный provider(SavedStateProvider) по ключу `SAVED_STATE_KEY`, это ключ для хранения
SavedStateHandlesProvider(он же SavedStateProvider), если по ключу нечего не найдено, то есть null, это означает что provider
еще не был регистрирован, тогда создается объект SavedStateHandlesProvider(он же SavedStateProvider), регистрируется в savedStateRegistry.

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

На текущий момент мы понимаем как SavedStateHandle работает в связке с ViewModel, и как он в итоге соеденятся к SavedStateRegisrty,
Так же до этого мы узнали как работает сам SavedStateRegisrty и SavedStateRegistryController, и увидели их связть с методами
onSaveInstanceState и onRestoreInstanceState, оказалось и Saved State Api и древние методы onSaveInstanceState и onRestoreInstanceState
работают в итоге по одному и тому же пути к конечном итоге, давайте вернемся к точке где они встречаються, далее
код который мы уже видели:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Restore the Saved State first so that it is available to
        // OnContextAvailableListener instances
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

То есть в стандартной практике при использований механизма сохронения состояния используют эти два метода,
onCreate - получает на вход параметр savedInstanceState с типом Bundle, именно в этом методе как раз читают сохроненное значение
onSaveInstanceState - получает на вход параметр outState с типом Bundle, в этом параметр outState записывают значения которые должны быть
сохранены

Давайте поймем каким же образом вся это конструкция работает, то каким образом значения сохроенное в outState метода onSaveInstanceState
переживает изменение конфигураций, и даже смерть системы, и поймем каким образом сохроненные знаячения обратно прилетают в onCreate,
посмотрим на метод onSaveInstancrState внутри super-а, то есть в самом классе Activity:

```java
public class Activity extends ContextThemeWrapper ...{

final void performSaveInstanceState(@NonNull Bundle outState) {
    dispatchActivityPreSaveInstanceState(outState);
    onSaveInstanceState(outState);
    saveManagedDialogs(outState);
    mActivityTransitionState.saveState(outState);
    storeHasCurrentPermissionRequest(outState);
    if (DEBUG_LIFECYCLE) Slog.v(TAG, "onSaveInstanceState " + this + ": " + outState);
    dispatchActivityPostSaveInstanceState(outState);
}

protected void onSaveInstanceState(@NonNull Bundle outState) {
    outState.putBundle(WINDOW_HIERARCHY_TAG, mWindow.saveHierarchyState());

    Parcelable p = mFragments.saveAllState();
    if (p != null) {
        outState.putParcelable(FRAGMENTS_TAG, p);
    }
    getAutofillClientController().onSaveInstanceState(outState);
    dispatchActivitySaveInstanceState(outState);
}
}    
```

Все что происходит внутри этого метода нас сейчас не волнует, можно увидеть что метод onSaveInstanceState вызывает другой
финальный метод performSaveInstanceState, давайте теперь поймем кто же его вызывает? Этот вызов иницириуется классом Instrumentation:
android.app.Instrumentation.java:

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

<note>
<title>
Официальная документация гласит следующее об этом классе:
</title>
Base class for implementing application instrumentation code. 
When running with instrumentation turned on, this class will be instantiated for you before any of the application code, 
allowing you to monitor all of the interaction the system has with the application. 
An Instrumentation implementation is described to the system through an AndroidManifest.xml's <instrumentation/> tag.
</note>

Нужно теперь понимать кто же вызывает Instrumentation.callActivityOnSaveInstanceState? И мы встречаем ActivityThread:

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

Что здесь происходит? callActivityOnSaveInstanceState на вход принимает параметр r c типом ActivityClientRecord,
у этого класса ActivityClientRecord есть поле state который является Bundle, ему присвается нговый объект Bundle,

Класс `ActivityClientRecord` мы уже встречали когда рассматривали ViewModelStore,  `ActivityClientRecord` представляет собой запись
активности и используется для хранения всей информации, связанной
с реальным экземпляром активности.  
Это своего рода структура данных для ведения учета активности в процессе выполнения приложения.

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

Пока что не будем отвлекаться, и узнаем кто же вызывает callActivityOnSaveInstanceState:

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    private void callActivityOnStop(ActivityClientRecord r, boolean saveState, String reason) {
        // Before P onSaveInstanceState was called before onStop, starting with P it's
        // called after. Before Honeycomb state was always saved before onPause.
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
        // Pre-Honeycomb apps always save their state before pausing
        final boolean shouldSaveState = !r.activity.mFinished && r.isPreHoneycomb();
        if (shouldSaveState) {
            callActivityOnSaveInstanceState(r);
        }
       ...
    }
}
```

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    private void performStopActivityInner(ActivityClientRecord r, StopInfo info,
                                          boolean saveState, boolean finalStateRequest, String reason) {
      ...
        callActivityOnStop(r, saveState, reason);
    }

    private void handleRelaunchActivityInner(@NonNull ActivityClientRecord r,
                                             @Nullable List<ResultInfo> pendingResults,
                                             @Nullable List<ReferrerIntent> pendingIntents,
                                             @NonNull PendingTransactionActions pendingActions, boolean startsNotResumed,
                                             @NonNull Configuration overrideConfig, @NonNull ActivityWindowInfo activityWindowInfo,
                                             @NonNull String reason) {
       ...
        if (!r.stopped) {
            callActivityOnStop(r, true /* saveState */, reason);
        }
       ...
    }
}
```

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

Последующие вызовы методов performStopActivity и handleRelaunchActivity упираются в классы ActivityRelaunchItem.execute(),
ActivityTransactionItem.execute() и TransactionExecutor.execute() - которые мы уже встречали в первой статье

На данный момент мы выследили следующий вызов:

`handleStopActivity` → `performStopActivityInner` → `callActivityOnStop` → `callActivityOnSaveInstanceState` →
`Instrumentation.callActivityOnSaveInstanceState` → `Activity.performSaveInstanceState` → `onSaveInstanceState`.

Это ключевая цепочка, которая обеспечивает сохранение состояния `Activity` при изменениях конфигурации или завершении её работы. Обратим
внимание, что вызов `callActivityOnSaveInstanceState` из `Instrumentation` — это и есть та самая точка, где система передаёт управление
обратно в `Activity`, вызывая метод `performSaveInstanceState`, который, в свою очередь, инициирует сохранение всех данных в объект`Bundle`.

Параллельно, в случае изменения конфигурации или пересоздания активности, запускается другая цепочка:

`handleRelaunchActivity` → `handleRelaunchActivityInner` → `callActivityOnStop` → `callActivityOnSaveInstanceState` →
`Instrumentation.callActivityOnSaveInstanceState` → `Activity.performSaveInstanceState` → `onSaveInstanceState`.

Эти две цепочки работают независимо, но сходятся в методе `callActivityOnStop`, который гарантирует сохранение данных в `Bundle` перед тем,
как `Activity` будет остановлена или пересоздана.

Далее, сформированный объект `Bundle`, содержащий состояние `Activity`, сохраняется в объекте `ActivityClientRecord`. Этот объект
представляет собой структуру данных, хранящую всю необходимую информацию о `Activity` во время её жизненного цикла. Именно в поле `state`
этого класса система сохраняет переданный `Bundle`, чтобы при пересоздании `Activity` восстановить её состояние.

Таким образом, мы понимаем, что вся эта цепочка запускается не из самой `Activity`, а из внутренней логики Android через `ActivityThread`.
Это ещё раз подтверждает, что все жизненные циклы управляются системой через единый механизм клиент-серверных транзакций, а `ActivityThread`
выполняет роль посредника, координирующего вызовы между `Activity` и основной системой.

---

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
состояния.

Теперь поднимемся выше. Кто же вызывает `callActivityOnCreate`? За это отвечает метод `performLaunchActivity` в классе `ActivityThread`:

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
    public Activity handleLaunchActivity(ActivityClientRecord r,
                                         PendingTransactionActions pendingActions, int deviceId, Intent customIntent) {
    ...
        final Activity a = performLaunchActivity(r, customIntent);
    ...
    }
}
```

### Перезапуск Activity при релаунче (например, при повороте экрана)

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

Вызов метода handleRelaunchActivity иницирует класс команда `ActivityRelaunchItem`, которая действует как маркер для того, чтобы выполнить
перезапуск с сохранением состояния:

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
`LaunchActivityItem.execute` → `handleLaunchActivity` → `performLaunchActivity` → `callActivityOnCreate` → `performCreate` → `onCreate`.

Точно, это важный момент! Можно переформулировать так, чтобы это стало понятнее и подчеркнуть, что оба поля (`state` и
`lastNonConfigurationInstances`) действительно находятся в `ActivityClientRecord`. Вот улучшенная версия:

Далее, к сожалению, подниматься выше по цепочкам вызовов не имеет смысла, иначе статья начнёт раздуваться до гигантских масштабов. Но прежде
чем двигаться дальше, у нас остаётся несколько ключевых вопросов, которые нужно раскрыть:

1. **Где в конечном итоге хранится этот `Bundle`? И кто именно вызывает команды `LaunchActivityItem` и `ActivityRelaunchItem`?**
   Эти классы явно играют важную роль в процессе восстановления, но до конца неясно, кто же запускает их выполнение.

2. **Если, как мы уже выяснили, `Bundle` действительно находится в поле `state` внутри класса `ActivityClientRecord`, то почему он умеет "
   переживать" смерть процесса, а вот `NonConfigurationInstance`, который тоже хранится в этом же объекте — в
   поле `lastNonConfigurationInstances` — нет?**
   Напомню, что под капотом `NonConfigurationInstance` содержит в себе такие важные вещи, как `ViewModelStore`, `RetainFragments` и даже
   `ActivityGroup`. Однако при перезапуске процесса его содержимое пропадает, в то время как `Bundle` успешно восстанавливается. Почему так?

Нанчнем с первого:

```java
public class TransactionExecutor {

    public void execute(@NonNull ClientTransaction transaction) {
        if (DEBUG_RESOLVER) {
            Slog.d(TAG, tId(transaction) + "Start resolving transaction");
            Slog.d(TAG, transactionToString(transaction, mTransactionHandler));
        }

        Trace.traceBegin(Trace.TRACE_TAG_WINDOW_MANAGER, "clientTransactionExecuted");
        try {
            if (transaction.getTransactionItems() != null) {
                executeTransactionItems(transaction);
            } else {
                // TODO(b/260873529): cleanup after launch.
                executeCallbacks(transaction);
                executeLifecycleState(transaction);
            }
        } catch (Exception e) {
            Slog.e(TAG, "Failed to execute the transaction: "
                    + transactionToString(transaction, mTransactionHandler));
            throw e;
        } finally {
            Trace.traceEnd(Trace.TRACE_TAG_WINDOW_MANAGER);
        }

        mPendingActions.clear();
        if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "End resolving transaction");
    }

    @VisibleForTesting
    @Deprecated
    public void executeCallbacks(@NonNull ClientTransaction transaction) {
        final List<ClientTransactionItem> callbacks = transaction.getCallbacks();
        if (callbacks == null || callbacks.isEmpty()) {
            // No callbacks to execute, return early.
            return;
        }
        if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "Resolving callbacks in transaction");

        // In case when post-execution state of the last callback matches the final state requested
        // for the activity in this transaction, we won't do the last transition here and do it when
        // moving to final state instead (because it may contain additional parameters from server).
        final ActivityLifecycleItem finalStateRequest = transaction.getLifecycleStateRequest();
        final int finalState = finalStateRequest != null ? finalStateRequest.getTargetState()
                : UNDEFINED;
        // Index of the last callback that requests some post-execution state.
        final int lastCallbackRequestingState = lastCallbackRequestingState(transaction);

        final int size = callbacks.size();
        for (int i = 0; i < size; ++i) {
            final ClientTransactionItem item = callbacks.get(i);

            // Skip the very last transition and perform it by explicit state request instead.
            final int postExecutionState = item.getPostExecutionState();
            final boolean shouldExcludeLastLifecycleState = postExecutionState != UNDEFINED
                    && i == lastCallbackRequestingState && finalState == postExecutionState;
            executeNonLifecycleItem(transaction, item, shouldExcludeLastLifecycleState);
        }
    }
}
```

```java
public final class ActivityThread extends ClientTransactionHandler implements ActivityThreadInternal {

    class H extends Handler {

        public void handleMessage(Message msg) {
            if (DEBUG_MESSAGES) Slog.v(TAG, ">>> handling: " + codeToString(msg.what));
            switch (msg.what) {
                ...
                case EXECUTE_TRANSACTION:
                    final ClientTransaction transaction = (ClientTransaction) msg.obj;
                    final ClientTransactionListenerController controller =
                            ClientTransactionListenerController.getInstance();
                    controller.onClientTransactionStarted();
                    try {
                        mTransactionExecutor.execute(transaction);
                    } finally {
                        controller.onClientTransactionFinished();
                    }
                    if (isSystem()) {
                        // Client transactions inside system process are recycled on the client side
                        // instead of ClientLifecycleManager to avoid being cleared before this
                        // message is handled.
                        transaction.recycle();
                    }
                    // TODO(lifecycler): Recycle locally scheduled transactions.
                    break;
                ...
            }
        }
    }
}

```