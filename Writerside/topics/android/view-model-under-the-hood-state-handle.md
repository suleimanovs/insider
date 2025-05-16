Это продолжение трех предыдущих статей.

### Введение

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`,
2. Во второй — как это устроено во `Fragment`,
3. В третьей где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).

В этой статье рассмотрим Где хранится SavedStateHandle, SavedStateHandle vs onSaveInstanceState vs ViewModel(ViewModelStore)
Особенно когда мы объявляем `ViewModel` прямо внутри `Composable` функций. Но, как всегда, начнём с базиса.

### Базис

В статье не будет описания как работать с этими Api, а будет о том как они работают изнутри, по этому я буду пологаться на то
что вы уже работали с ними.
Как всегда начнем с базиса, давайте сначала дадим определения для SavedStateHandle, onSaveInstanceState, ViewModel:

**ViewModel** - компонент архитектурного паттерна MVVM, который был предоставлен Google как примитив
позволяющий пережить изменение конфигураций. Изменение конфигураций в свою очередь - это состояние, заставляющая
activity/fragment пересоздаваться, это именно то состояние которое может пережить ViewModel. Увы на этом обьязанности ViewModel по
хранению данных заканчивается

Если proccess приложения умирает или прырывается proccess , то в таком случае ViewModel не справится,
по этому тут в дело входит старый добрый метод onSaveInstanceState/onRestoreInstanceState

**onSaveInstanceState/onRestoreInstanceState** — это методы жизненного цикла Activity, Fragment и View(да View тоже может сохронять
состояние)
которые позволяют сохранять и восстанавливать временное состояние пользовательского интерфейса при изменениях конфигурации (например, при
повороте экрана)
или при полном уничтожении активности из-за нехватки ресурсов.
В onSaveInstanceState данные сохраняются в Bundle, который автоматически передаётся в метод onRestoreInstanceState при восстановлении
активности.

Это базовый механизм для хранения состояния примитивных(и их массивы) типов данных, Parcelable/ Serializeble и еще пару нативных андроид
типов,
но эти методы требуют явного указания того, что именно нужно сохранить, плюс логика прописывается внутри Activity и Fragment.
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
подписаться на Flow, LiveData данные которые он хранит и восстанавливает
Он автоматически интегрирован с ViewModel и поддерживает сохранение состояния при изменениях конфигурации, а также при полном уничтожении
приложения(процесса).
Дополнительное преимущество — это возможность подписываться на изменения значений в SavedStateHandle, получая реактивное поведение прямо в
ViewModel.

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
больше не
взаимодействует с активностью, или `onStop`, который вызывается, когда активность становится невидимой. Пример, когда `onPause` и `onStop`
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

Тот же Пример что и выше, только переписанный с использованием Saved State Api, делает ровно тоже самое:

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

Мы вызываем у объекта savedStateRegistry метод registerSavedStateProvider куда передаем key и анонимный объект
SavedStateRegistry.SavedStateProvider который
возвращает bundle обернутый в объект SavedState, давайте сейчас же определим что из себя представляет этот тип SavedState, если зайти в
исходники, а
именно в expect логику, то тип описан следующим образом:
androidx.savedstate.SavedState.kt

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

в контексте android нас интересует именно actual реализация, по этому далее специфичная для android actual:
androidx.savedstate.SavedState.android.kt

```kotlin
public actual typealias SavedState = android.os.Bundle
```

Как видим в android нет на самом деле какого-то типа как SavedState, в actual реализаций это просто typealias который ссылается
на тот же старый добрый родной класс Bundle, по этому всегда представляйте что там где используется SavedState - на самом деле используется
класс Bundle, и ничто нам не мешает не использовать двоную обертку, а напрямую вернуть сам bundle:

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
эти методы вызывается у переменной savedStateRegistry которая имеет тип SavedStateRegistry, давайте быстро узнаем определение этого класса:

**`SavedStateRegistry`** - управляет сохранением и восстановлением сохранённого состояния, чтобы данные не терялись при пересоздании
компонентов.
Реализация привязана к SavedStateRegistryImpl, которая отвечает за фактическое хранение и восстановление данных.
Интерфейс для подключения компонентов, которые потребляют и вносят данные в сохранённое состояние.
Объект имеет такой же жизненный цикл, как и его владелец (Activity или Fragment):
когда Activity или Fragment пересоздаются (например, при повороте экрана или изменении конфигурации),
создаётся новый экземпляр этого объекта.

Но откуда береться `savedStateRegistry` переменная внутри activity мы рассмотрим позже, пока достаточно знать
что он есть у activity, далее исходники метода `registerSavedStateProvider` и `consumeRestoredStateForKey` пренадлежащий классу
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

Как мы видим на самом деле тут много методов у SavedStateRegistry, для нашей статьи достаточно понимать работу методов
`registerSavedStateProvider` и `consumeRestoredStateForKey`, но что бы хоть какое-то понимание было, давайте быстро пройдемся по каждому:

1. **consumeRestoredStateForKey** — извлекает и удаляет из памяти `SavedState`(Bundle), который был зарегистрирован с помощью
   `registerSavedStateProvider`. При повторном вызове возвращает `null`.

2. **registerSavedStateProvider** — регистрирует `SavedStateProvider` с указанным ключом.
   Этот провайдер будет использоваться для сохранения состояния при вызове `onSaveInstanceState`.

3. **getSavedStateProvider** — возвращает зарегистрированный `SavedStateProvider` по ключу или `null`, если он не найден.

4. **unregisterSavedStateProvider** — удаляет из реестра ранее зарегистрированный `SavedStateProvider` по переданному ключу.

5. **SavedStateProvider** — интерфейс, предоставляющий объект `SavedState`(Bundle) при сохранении состояния.

6. **isRestored** — возвращает `true`, если состояние было восстановлено после создания компонента.

в expect версий нет реализаций, только сигнатуры методов, так же мы увидели исходники интерфейса SavedStateProvider который является
каллбэком для получения bundle который нужно сохранить, что бы увидеть реализацию метода registerSavedStateProvider, надо поискать
**actual реализацию, далее actual реализация SavedStateRegistry:**

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

actual реализация SavedStateRegistry делегирует все вызовы своих методов готовой имплементацией SavedStateRegistryImpl,
по этому далее рассмотрим именно SavedStateRegistryImpl:

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

Основные методы для сохронения, давайте просто поймем что здесь происходит:

1. consumeRestoredStateForKey - достает значение из restoredState(Bundle) по ключу, после того как достает значение,
   удаляет из restoredState(Bundle) значение и ключ, restoredState является самым коренным Bundle который внутри себя хранит все другие
   bundle
2. registerSavedStateProvider - просто добавляет объеки `SavedStateProvider` внутрь карты `keyToProviders`

Эти методы очень верхнеуровневые и никак не раскрывают то как в конечном итоге данные сохроняются, по этому нам нужно копнуть дальше,
внутри этого же класса SavedStateRegistryImpl:

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

Так понятно, структура хорошая, но можно немного сгладить формулировки для лучшего восприятия:

1. performSave — вызывается, когда Activity или Fragment переходит в состояние pause -> stop, то есть в момент вызова onSaveInstanceState.
   Этот метод отвечает за сохранение состояния всех SavedStateProvider, зарегистрированных через registerSavedStateProvider. Внутри метода
   создается объект inState типа SavedState (по сути, это сам Bundle). Если в restoredState уже есть данные, они добавляются в
   inState. Затем, в синхронизированном блоке, происходит обход всех зарегистрированных SavedStateProvider, вызывается метод saveState(), и
   результаты сохраняются в inState. В конце, если inState не пустой, его содержимое записывается в параметр outBundle под ключом
   SAVED_COMPONENTS_KEY.

2. performRestore — вызывается при создании или восстановлении Activity или Fragment. Этот метод просто читает из savedState значение по
   ключу SAVED_COMPONENTS_KEY, если оно существует. Найденное значение (вложенный SavedState) сохраняется в переменную restoredState,
   чтобы потом можно было передать его в соответствующие компоненты.

На данный момент мы увидели как как работает логика сохронения и регистраций, теперь осталось понять кто же в вызывает методы `performSave`
и `performRestore` и в какой момент.

Этой логикой управляет SavedStateRegistryController, в связи с тем что Saved State Api тоже на kmp, по этому лучше сразу посмотрим
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

И видим что вызовами методов SavedStateRegistryImpl.performSave и SavedStateRegistryImpl.performRestore управляют алогичные методы
из SavedStateRegistryController, так же видим метод create, который создает SavedStateRegistryImpl b передает его в конструктор
SavedStateRegistryController и возвращается SavedStateRegistryController, далее осталось только понимать то откуда вызывается сами методы
SavedStateRegistryController, в начале статьи мы отложили разбираться в том откуда береться поле savedStateRegistry у Activity, сейчас
самое время узнать,

внутри activity нам доступна поле savedStateRegistry, это поле доступна так как потому что Activity реализует interface
SavedStateRegistryOwner
если зайти в исходники то можно это увидеть
что ComponentActivity реализует интерфейс SavedStateRegistryOwner, на самом деле ComponentActivity реализует много интерфейсов, в исходниках
ниже опущены все родители кроме SavedStateRegistryOwner:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {

    private val savedStateRegistryController: SavedStateRegistryController =
        SavedStateRegistryController.create(this)

    final override val savedStateRegistry: SavedStateRegistry
        get() = savedStateRegistryController.savedStateRegistry

}
```

SavedStateRegistryOwner - это просто interface который хранит в себе SavedStateRegistry, его реализует Activity, Fragment и
NavBackStackEntry, выглядит он следующим образом:

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
  
      SavedStateRegistryController mSavedStateRegistryController;
  
  
    @NonNull
    @Override
    public final SavedStateRegistry getSavedStateRegistry() {
        return mSavedStateRegistryController.getSavedStateRegistry();
    }

   public class Fragment implements ... SavedStateRegistryOwner, ...{
  
          private void initLifecycle() {
        ...
        mSavedStateRegistryController = SavedStateRegistryController.create(this);
        ...
    }
  
  }

   ```
* `NavBackStackEntry` - компонент навигаций из Jetpack Navigation

```kotlin
public expect class NavBackStackEntry : ..., SavedStateRegistryOwner {

    override val savedStateRegistry: SavedStateRegistry

}
```

Мы выяснили большую цепочку вызовов, давайте визуально прпосмотрим :

```nginx
expect -> SavedStateRegistryController.performSave 
  -> actual SavedStateRegistryController.performSave 
  -> expect SavedStateRegistry 
  -> actual SavedStateRegistry 
  -> SavedStateRegistryImpl.performSave 
  -> SavedStateProvider.saveState() 
  -> // Bundle
```

Углубляться в работу Fragment и NavBackStackEntry не будем, разберемся только с Activity, на данный момент мы понимаем что в конечном итоге
все вызовы идут в SavedStateRegistryController, давай посмотрим как Activity с ними взаимодейтсвует:

метод performRestore у SavedStateRegistryController по восстановлению данных из bundle вызывается внутри ComponentActivity.onCreate,
а метод performSave у SavedStateRegistryController по сохронению данных в bundle вызывается внутри ComponentActivity.onSaveInstanceState

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
        if (lifecycle is LifecycleRegistry) {
            (lifecycle as LifecycleRegistry).currentState = Lifecycle.State.CREATED
        }
        super.onSaveInstanceState(outState)
        savedStateRegistryController.performSave(outState)
    }
}
```

Здесь та самая точка когда onSaveInstanceState/onRestoreInstance обьяденяются в одну точку с SavedStateRegistryController/SavedStateRegistry

На это переключимся к ViewModel с его SavedStateHandle, что бы понять как она соеденяется ко всей это логике,
давайте, обьявим обычную ViewModel но в конструкторе будем ожидать SavedStateHandle:

```kotlin
class MyViewModel(val savedStateHandle: SavedStateHandle) : ViewModel()
```

<note>
Как и говорилось в начале статьи, это не гайд по тому как пользоваться Saved Sate Api, тут больше ответ на вопрос как это работает под капотом
</note>

Далее пробуем инициализировать нашу ViewModel в Activity

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

Тут на первый вгляд можно ожидать что будет краш при запуске приложения, так как если ViewModel на вход принимает какой
либо параметр, то нужна фабрика ViewModel, он же ViewModelProvider.Factory, где мы в ручную должны каким-то образом положить требуемый
параметр в конструкторе, и в нашем примере конструктор не пустой, но если мы запустим этот код, то никакого краша и ошибки не будет,
все запуститься и инициализируется должным образом, почему так?

Разработчики из google знали что часто понадобиться передавать SavedStateHandle в ViewModel, и что бы разработчикам не приходилось каждый
раз создавать фабрику для передачи - имеется готовая фабрика которая работает под капотом, так же имеются готовые классы вроде

`AbstractSavedStateViewModelFactory` -  начиная с lifecycle-viewmodel-savedstate-android-**2.9.0** - обьявлен устаревшим
`SavedStateViewModelFactory` - актуален на данный момент для создания ViewModel с SavedStateHandle

Давайте теперь посмотрим как это работает на уровне Activity, Логику ViewModelProvider/ViewModel мы уже рассмотрели, сейчас просто пройдемся
по интересующей нас теме, когда мы обращаемся к ViewModelProvider.create:

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

То видим что в качестве factory идет обращение к методу ViewModelProviders.getDefaultFactory(owner), посмотрим его исходники тоже:

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
ViewModelProvider**s** -  это класс утилита, не стоит его путать с классом ViewModelProvider
</note>

В этом методе нас интересует проверка на is HasDefaultViewModelProviderFactory

```kotlin

if (owner is HasDefaultViewModelProviderFactory) {
    owner.defaultViewModelProviderFactory
}
```

если owner(ViewModelStoreOwner(Activity/Fragment)) реализует интерфейс HasDefaultViewModelProviderFactory, то у него береться поле
defaultViewModelProviderFactory, интерфейс HasDefaultViewModelProviderFactory выглядит следующим образом:
**androidx.lifecycle.HasDefaultViewModelProviderFactory.android.kt:**

```kotlin

public interface HasDefaultViewModelProviderFactory {

    public val defaultViewModelProviderFactory: ViewModelProvider.Factory

    public val defaultViewModelCreationExtras: CreationExtras
        get() = CreationExtras.Empty
}
```

Реализация интерфейса в Activity:

```kotlin
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {
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

Тут происходят две очень важные моменты

1. defaultViewModelProviderFactory - В качестве фабрики по умолчанию используется SavedStateViewModelFactory
2. defaultViewModelCreationExtras - В качестве CreationExtras кладется SavedStateRegistryOwner под ключем SAVED_STATE_REGISTRY_OWNER_KEY,
   и ViewModelStoreOwner под ключем VIEW_MODEL_STORE_OWNER_KEY

Это ключевая часть того как в итоге SavedStateHandle подключается к ViewModel и к SavedStateRegistryOwner

Так же глянем на исходники SavedStateViewModelFactory:
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
                 create(key, modelClass) //legacy way
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


Тут сокращена логика их исходников что бы сосредоточиться на главном, внутри метода create у фабрики проверяется имеют ли extras
поля c ключами SAVED_STATE_REGISTRY_OWNER_KEY и VIEW_MODEL_STORE_OWNER_KEY, если имеется, до дальше происходит
вызов метода newInstance которая через рефлексию вызывает конструктор и передает параметры, но интерусующая часть, это вызов createSavedStateHandle():
```kotlin
newInstance(modelClass, constructor, extras.createSavedStateHandle())
```

давайте глянем в исходники createSavedStateHandle:
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

Видим что достаются нужные компоненты по ключам, далее исходники метода createSavedStateHandle:
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

savedStateHandlesProvider - Это функция расширения которая возвращает объект SavedStateHandlesProvider(SavedStateProvider)
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
      if (!restored) {
         val newState = savedStateRegistry.consumeRestoredStateForKey(SAVED_STATE_KEY)
         restoredState = savedState {
            restoredState?.let { putAll(it) }
            newState?.let { putAll(it) }
         }
         restored = true
         // Grab a reference to the ViewModel for later usage when we saveState()
         // This ensures that even if saveState() is called after the Lifecycle is
         // DESTROYED, we can still save the state
         viewModel
      }
   }

   /** Restore the state associated with a particular SavedStateHandle, identified by its [key] */
   fun consumeRestoredStateForKey(key: String): SavedState? {
      performRestore()
      val state = restoredState ?: return null
      if (state.read { !contains(key) }) return null

      val result = state.read { getSavedStateOrNull(key) ?: savedState() }
      state.write { remove(key) }
      if (state.read { isEmpty() }) {
         this.restoredState = null
      }

      return result
   }
}
``` 

savedStateHandlesVM - это фукнция расщирения которая возвращает SavedStateHandlesVM:
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

Вернемся к функций createSavedStateHandle :
```kotlin
    return viewModel.handles[key]
        ?: SavedStateHandle.createHandle(provider.consumeRestoredStateForKey(key), defaultArgs)
            .also { viewModel.handles[key] = it }
```
Тут сначала ищеться нужный  SavedStateHandle внутри SavedStateHandlesVM, если не найдено то происходит создание SavedStateHandle, он кладется в SavedStateHandlesVM для хранение, и фукнция createSavedStateHandle возвращает
управление обратно другой фукнций CreationExtras.createSavedStateHandle() которую мы уже видели, и в конечном итоге управление возрващается
в factory, таким образом создается SavedStateHandle для конкретной ViewModel,