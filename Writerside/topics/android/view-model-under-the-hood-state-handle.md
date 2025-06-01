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

**onSaveInstanceState/onRestoreInstanceState** — это методы жизненного цикла Activity, Fragment и View(да View тоже может сохранять
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

Реализация по умолчанию этого метода автоматически сохраняет большую часть состояния пользовательского интерфейса, **вызывая метод
`onSaveInstanceState()` у каждого представления (`View`) в иерархии**, у которых есть ID, так же сохраняется ID элемента, который был в фокусе.
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

Давайте теперь посмотрим как это работает на уровне `Activity`, логику `ViewModelProvider/ViewModel` мы уже рассматривали, сейчас просто
пройдемся
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
    // If we already have a reference to a previously created SavedStateHandle
    // for a given key stored in our ViewModel, use that. Otherwise, create
    // a new SavedStateHandle, providing it any restored state we might have saved
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
На самом деле это просто extension, который вытаскивает объект (`SavedStateProvider`) из `SavedStateRegistry`.

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

Взаимодействие с `SavedStateHandlesVM`. Теперь перейдём к тому, как данные хранятся внутри `ViewModel`. `savedStateHandlesVM` — это
расширение, которое создаёт или восстанавливает
объект `SavedStateHandlesVM`, хранящий в себе мапу из ключей на `SavedStateHandle`:

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
    // Add the SavedStateProvider used to save SavedStateHandles
    // if we haven't already registered the provider
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

<note>
<title>
Официальная документация гласит следующее об этом классе:
</title>
Base class for implementing application instrumentation code.  
When running with instrumentation turned on, this class will be instantiated for you before any of the application code,  
allowing you to monitor all of the interaction the system has with the application.  
An Instrumentation implementation is described to the system through an AndroidManifest.xml's `<instrumentation/>` tag.
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

Последующие вызовы методов `performStopActivity` и `handleRelaunchActivity` упираются в классы `ActivityRelaunchItem.execute()`,
`StopActivityItem.execute()`, `performStopActivity` - вызывается из `StopActivityItem.execute()`, а `handleRelaunchActivity` вызывается
из `ActivityRelaunchItem.execute()`,

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

Вызов метода handleRelaunchActivity иницирует класс команда/транзакция `ActivityRelaunchItem`, которая действует как маркер для того, чтобы
выполнить
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
`LaunchActivityItem.execute` → `handleLaunchActivity` → `performLaunchActivity` → `callActivityOnCreate` → `performCreate` → `onCreate`.

Следует запомнить важную вещь, прежде чем подниматься выше, нужно понимать что `LaunchActivityItem` — это транзакция, которая в своём
конструкторе принимает
`Bundle` и `PersistableBundle` (последний мы рассматривать не будем). Класс `LaunchActivityItem` наследуется от `ClientTransactionItem`.

`ClientTransactionItem` — это абстрактный базовый класс, от которого наследуются все транзакции, связанные с жизненным циклом `Activity`. В
него входят `LaunchActivityItem`, `ActivityRelaunchItem`, `ResumeActivityItem` (последние — **не прямые**, а транзитивные наследники) и
другие элементы, участвующие в управлении состоянием `Activity`.

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
        final IBinder token = lifecycleItem.getActivityToken();
        final ActivityClientRecord r = mTransactionHandler.getActivityClient(token);
        ...
        // Execute the final transition with proper parameters.
        lifecycleItem.execute(mTransactionHandler, mPendingActions);
        lifecycleItem.postExecute(mTransactionHandler, mPendingActions);
    }

    private void executeNonLifecycleItem(@NonNull ClientTransaction transaction,
                                         @NonNull ClientTransactionItem item, boolean shouldExcludeLastLifecycleState) {
        final IBinder token = item.getActivityToken();
        ActivityClientRecord r = mTransactionHandler.getActivityClient(token);
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
объект `H`, а также `TransactionExecutor`, которому в качестве аргумента передаётся `this` — то есть `ActivityThread`, реализующий
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
или binding Application. так же заметьте что он реализует IApplicationThread.Stub, то есть фактический сам AIDL интерфейс IApplicationThread

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
`LaunchActivityItem`,
`ResumeActivityItem`, `PauseActivityItem` и т.д.), после чего передаёт её в метод `onClientTransactionItemScheduled`, где вызывается
`scheduleTransaction`.

После чего управление переходит в метод `scheduleTransaction`, внутри которого вызывается `transaction.schedule()`. А как мы уже знаем,
метод
`schedule` вызывает `ApplicationThread.scheduleTransaction`, то есть фактически мы возвращаемся обратно к AIDL-вызову, из которого всё и
начинается.

Таким образом, `ClientLifecycleManager` собирает транзакцию, наполняет её нужными `ClientTransactionItem`, и отправляет её в исполнение. Это
класс, который формирует цепочку действий, и делегирует выполнение низкоуровневому слою через AIDL.

<note title="Мотивация">
Если на этом моменте вы уже устали отслеживать вызовы, и думаете когда же это закончится, то скажу что мы почти на финале
</note>

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
3. Видим что у класса ActivityTaskManagerService вызывается метод `getLifecycleManager()` который возвращает объект каласса
   `ClientLifecycleManager`
   и вызывает у него метод scheduleTransactionItems который мы уже видели, с передачей `LaunchActivityItem`

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
picture-in-picture и любые изменения, связанные с конфигурацией экрана.
Всё, что должно появиться, исчезнуть, пересчитаться или анимироваться — сначала проходит через него.
Это точка входа для всех транзакций окон, включая запуск и завершение активностей.

Он настолько крут, что может остановить перезапуск activity, если чувствует, что layout всё ещё "в пути".
Ему не нужно подтверждение от `WindowManagerService` для показа Window и работы с контентом.

`RootWindowContainer` раньше назывался `RootActivityContainer`
</tip>

Видим вызов метода `ActivityTaskSupervisor.realStartActivityLocked` происходит в классе RootWindowContainer, который в методе
`attachApplication`, получает список ActivityRecord у ActivityTaskManagerService, и в цикле для всех вызывает метод
`ActivityTaskSupervisor.realStartActivityLocked`.

Далее мы снова возвращаемся к `ActivityTaskManagerService`, потому что именно он вызывает у RootWindowContainer и передает
ему

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

Видим что он хранит в себе список ActivityRecord в поле mStartingProcessActivities - вызов которого мы уже видели мы в
RootWindowContainer.attachApplication,

Далее видим что у него так же есть ссылка на RootWindowContainer, и в методе ActivityTaskManagerService.attachApplication
происходит вызов метода RootWindowContainer.attachApplication,
startProcessAsync -  Так же очень важный метод, который в список ActivityRecord добавляет новые ActivityRecord внутри
которых храниться Bundle, 

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

Так же видим метод getLifecycleManager который мы уже ранее встречали, и вот мы на финале,

```java
class TaskFragment extends WindowContainer<WindowContainer> {

    final boolean resumeTopActivity(ActivityRecord prev, ActivityOptions options,
                                    boolean skipPause) {
        ActivityRecord next = topRunningActivity(true /* focusableOnly */);
        mTaskSupervisor.startSpecificActivity(next, true, false);
        return true;
        ..
    }
}
```

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

```java
/** Root {@link WindowContainer} for the device. */
class RootWindowContainer extends WindowContainer<DisplayContent>
        implements DisplayManager.DisplayListener {
    boolean resumeFocusedTasksTopActivities(
            Task targetRootTask, ActivityRecord target, ActivityOptions targetOptions,
            boolean deferPause) {
        ...
        result = targetRootTask.resumeTopActivityUncheckedLocked(target, targetOptions,
                deferPause);
        ...
    }
}
```

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

Видим в методе finishAttachApplicationInner - вызов метода attachApplication у mAtmInternal, ActivityTaskManagerInternal который является
абстакрным AIDl для ActivityTaskManagerService,
по этому фактический здесь вызваеется ActivityTaskManagerService.attachApplication()

сам метод finishAttachApplicationInner вызывается из attachApplicationLocked,

Сам ActivityManagerService - является Singleton-ом в рамках всей системы Android, у него внутри есть своя структура PidMap
которая хранит в себе ProcessRecord, по ключу pid(то есть process id), то есть вызов mPidsSelfLocked.get(pid), mPidsSelfLocked:

```java
public class ActivityManagerService extends IActivityManager.Stub {

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
}
```


как вы наверное догадались, ProcessRecord хранит в себе
все всю информацию о процессе, в том числе массив ActivityRecord, давайте глянем на исходники ProcessRecord 
и метода getWindowProcessController()