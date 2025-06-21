# ViewModel Under The Hood: Compose

Это продолжение двух предыдущих статей. Если в первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в
случае с `Activity`, а во второй — как это устроено во `Fragment`, то сегодня разберёмся, где хранятся `ViewModel`-и,
когда мы используем **Compose** (или даже просто `View`).  
Особенно когда мы объявляем `ViewModel` прямо внутри `Composable` функций. Но, как всегда, начнём с базиса.

Есть такой подход — **View-based ViewModel scoping**. Что он значит?  
Мы все знаем стандартную практику, когда у каждого фрагмента или активити есть своя `ViewModel`.  
Но также существует и менее популярная история — когда у каждой `View` может быть своя собственная `ViewModel`.  
Насколько это полезно — решать вам. Вы спросите: а при чём тут Compose?  
А я отвечу: дело в том, что Compose работает **примерно по той же схеме**. Давайте начнём с простого примера:

---

### View-based ViewModel scoping — первый взгляд

Создадим кастомную `View`. Пусть это будет `TranslatableTextView`.  
Для нашего примера не так важно, **что именно делает** эта вьюха — главное, что мы хотим рассмотреть подход View-based
ViewModel scoping. Вот как это может выглядеть:

```kotlin
class TranslatableTextView(context: Context) : AppCompatTextView(context) {

    private val viewModel: TranslatableTextViewViewModel by lazy {
        val owner = findViewTreeViewModelStoreOwner() ?: error("ViewModelStoreOwner not found for TranslatableTextView")
        ViewModelProvider.create(owner = owner).get(TranslatableTextViewViewModel::class.java)
    }

    fun translateTo(locale: Locale) {
        text = viewModel.getTranslatedText(text.toString(), locale)
    }
}
```

Представим, что `TranslatableTextView` умеет переводить текст, как, например, в Telegram.  
Если бы мы использовали обычную `ViewModel`, пришлось бы дублировать логику на всех экранах, где используется эта
`View`. Но благодаря подходу **View-based ViewModel scoping**, у `TranslatableTextView` есть **своя собственная**
`ViewModel`.

Что мы здесь видим?  
– Инициализацию `viewModel` напрямую через ViewModelProvider без делегатов, с передачей ViewModelStoreOwner.  
– Простой метод `translateTo`, который принимает `Locale` и обновляет текст вьюхи (`AppCompatTextView`) на переведённый.

Давайте взглянем и на саму `ViewModel`, чтобы пример был полноценным и наглядным:

```kotlin
class TranslatableTextViewViewModel : ViewModel() {
    fun getTranslatedText(currentText: String, locale: Locale): String {
        // Здесь может быть настоящая локализация
        return "Translated('$currentText') to ${locale.displayLanguage}"
    }
}
```

Теперь снова вернёмся к `TranslatableTextView`, чтобы детальнее рассмотреть инициализацию `ViewModel`.
Она выглядит немного необычно:

```kotlin
class TranslatableTextView(context: Context) : AppCompatTextView(context) {

    private val viewModel: TranslatableTextViewViewModel by lazy {
        val owner = findViewTreeViewModelStoreOwner() ?: error("ViewModelStoreOwner not found for TranslatableTextView")
        ViewModelProvider.create(owner = owner).get(TranslatableTextViewViewModel::class.java)
    }
    ...
}
```

Первое, что бросается в глаза — это вызов метода `findViewTreeViewModelStoreOwner()`.  
Он возвращает нам `ViewModelStoreOwner`, а как мы помним, им могут быть только `ComponentActivity`, `Fragment` или
`NavBackStackEntry`.

Затем этот `owner` мы передаём в `ViewModelProvider`, чтобы тот создал (или вернул) нужную `ViewModel` и поместил её в
`ViewModelStore`.  
Напомню: `ViewModelStore` — это то место, где живёт и хранится наша `ViewModel`, и доступен он у каждого
`ViewModelStoreOwner`.

Давайте заглянем, как устроен сам метод `findViewTreeViewModelStoreOwner()` и каким образом он умеет доставать
`ViewModelStoreOwner`:

**ViewTreeViewModelStoreOwner.android.kt**:

```kotlin
/**
 * Retrieve the [ViewModelStoreOwner] associated with the given [View]. This may be used to retain
 * state associated with this view across configuration changes.
 *
 * @return The [ViewModelStoreOwner] associated with this view and/or some subset of its ancestors
 */
@JvmName("get")
public fun View.findViewTreeViewModelStoreOwner(): ViewModelStoreOwner? {
    var currentView: View? = this
    while (currentView != null) {
        val storeOwner =
            currentView.getTag(R.id.view_tree_view_model_store_owner) as? ViewModelStoreOwner
        if (storeOwner != null) {
            return storeOwner
        }
        currentView = currentView.getParentOrViewTreeDisjointParent() as? View
    }
    return null
}
```

Если коротко, то в этом методе происходит следующее: у текущей `View`, на которой вызвали
`findViewTreeViewModelStoreOwner`,  
мы ищем тег с id `R.id.view_tree_view_model_store_owner`. Полученное значение приводим к `ViewModelStoreOwner`,  
и если он не `null` — возвращаем его. А если `null`, то начинаем подниматься вверх по иерархии `View`.  
Эту работу выполняет метод `getParentOrViewTreeDisjointParent`. В исходники его лезть не будем — он просто возвращает
родителя текущей `View` (прямого родителя или не прямого родителя).  
Поскольку это происходит внутри цикла, мы поднимаемся по иерархии, пока не найдём одного из родителей, имеющий
тег `R.id.view_tree_view_model_store_owner` и в котором уже есть `ViewModelStoreOwner`.

На этом, в стиле Кристофера Нолана, временно забываем про этот метод — и посмотрим, как мы будем использовать
`TranslatableTextView`:

```kotlin
class MainActivity : AppCompatActivity() {

    private val frameRootLayout by lazy { findViewById<FrameLayout>(R.id.frameRootLayout) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Привязываем ViewModelStoreOwner к дереву ViewView(frameRootLayout)
        frameRootLayout.setViewTreeViewModelStoreOwner(this)

        val translatableView = TranslatableTextView(this)
        translatableView.text = "Hello, world!"
        frameRootLayout.addView(translatableView)

        // Пример использования перевода
        translatableView.translateTo(Locale.ENGLISH)
    }
}
```

Всё довольно просто, да?  
У нас есть некий layout, у которого root — это `FrameLayout` с id `R.id.frameRootLayout`.  
Мы находим этот `FrameLayout` и добавляем в него наш кастомный `View`: `TranslatableTextView`. Здесь всё понятно.

Но самое интересное — это вот эта строка:

```kotlin
// Привязываем ViewModelStoreOwner к дереву View(frameRootLayout)
frameRootLayout.setViewTreeViewModelStoreOwner(this)
```

---

Мы вызываем `setViewTreeViewModelStoreOwner` и передаём в него `this` — то есть саму `Activity`.  
Как мы знаем, `Activity` реализует интерфейс `ViewModelStoreOwner`,  
поэтому мы спокойно можем передать её туда, где требуется `ViewModelStoreOwner`.

Вот как выглядит цепочка наследования начиная с интерфейса ViewModelStoreOwner:

```
[interface] ViewModelStoreOwner → ComponentActivity → FragmentActivity → AppCompatActivity
```

То есть, когда мы передаём `this` из `Activity` в `setViewTreeViewModelStoreOwner`, то передаём полностью валидный
`ViewModelStoreOwner`, и всё работает как надо.  
Но как именно это связывание происходит внутри? За счёт чего потом `findViewTreeViewModelStoreOwner()` находит этого
владельца(`ViewModelStoreOwner`)?

Чтобы в этом разобраться, давайте заглянем в исходники метода `setViewTreeViewModelStoreOwner`, который мы ранее уже
встретили.
**ViewTreeViewModelStoreOwner.android.kt**:

```kotlin

/**
 * Set the [ViewModelStoreOwner] associated with the given [View]. Calls to [get] from this view or
 * descendants will return `viewModelStoreOwner`.
 *
 * This should only be called by constructs such as activities or fragments that manage a view tree
 * and retain state through a [ViewModelStoreOwner]. Callers should only set a [ViewModelStoreOwner]
 * that will be *stable.* The associated [ViewModelStore] should be cleared if the view tree is
 * removed and is not guaranteed to later become reattached to a window.
 *
 * @param viewModelStoreOwner ViewModelStoreOwner associated with the given view
 */
@JvmName("set")
public fun View.setViewTreeViewModelStoreOwner(viewModelStoreOwner: ViewModelStoreOwner?) {
    setTag(R.id.view_tree_view_model_store_owner, viewModelStoreOwner)
}
```

Рядом также находится метод `findViewTreeViewModelStoreOwner`, с которым мы уже знакомы.  
Сейчас нас интересует `setViewTreeViewModelStoreOwner`. Как видим, он просто кладёт `viewModelStoreOwner`  
в виде тега в указанную `View` по ключу `R.id.view_tree_view_model_store_owner`:

```kotlin
setTag(R.id.view_tree_view_model_store_owner, viewModelStoreOwner)
```

Все, кто работал с `View`, знают метод `setTag(Object?)`, но помимо этого есть и перегруженный метод:

```java
public void setTag(int key, final Object tag) {
    ...
}
```

Этот метод позволяет хранить разные теги по ключам, используя под капотом `SparseArray`. Это важный момент, потому что
именно через этот механизм мы и будем передавать `ViewModelStoreOwner`.

Теперь давайте разберёмся, что происходит на практике.

В методе `onCreate` в `Activity` мы вызываем метод `setViewTreeViewModelStoreOwner` для рутовой`View`(**R.id.frameRootLayout**),
передавая в качестве параметра `this`, то есть само `Activity`. Это потому, что `Activity`реализует интерфейс `ViewModelStoreOwner`.
Мы связываем эту активность с деревом представлений(View), чтобы иметь доступ к `ViewModelStore`(так как Activity является
ViewModelStoreOwner).

Далее мы добавляем нашу кастомную `View`(он же TranslatableTextView) в этот `frameRootLayout`. Пример:

```kotlin
class MainActivity : AppCompatActivity() {

    private val frameRootLayout by lazy { findViewById<FrameLayout>(R.id.frameRootLayout) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Привязываем ViewModelStoreOwner к дереву View
        frameRootLayout.setViewTreeViewModelStoreOwner(this)

        val translatableView = TranslatableTextView(this)
        translatableView.text = "Hello, world!"
        frameRootLayout.addView(translatableView)

        // Пример использования перевода
        translatableView.translateTo(Locale.ENGLISH)
    }
}
```

Теперь, что происходит дальше?

Когда мы находимся в нашем кастомном `View`, мы вызываем метод `findViewTreeViewModelStoreOwner`. Этот метод начинает
искать тег с ID `R.id.view_tree_view_model_store_owner` в самой вьюшке. Если он не находит нужный тег, он поднимется по
иерархии представлений, пока не найдёт родительский элемент, в котором этот тег присутствует:

```kotlin
class TranslatableTextView(context: Context) : AppCompatTextView(context) {

    private val viewModel: TranslatableTextViewViewModel by lazy {
        val owner = findViewTreeViewModelStoreOwner() ?: error("ViewTreeViewModelStoreOwner not found for TranslatableTextView")
        ViewModelProvider.create(owner = owner).get(TranslatableTextViewViewModel::class.java)
    }
    ...
}
```

Итак, этот механизм позволяет найти нужный `ViewModelStoreOwner` в дереве представлений, начиная с текущей вьюшки и
двигаясь вверх по иерархии до родительского компонента, в котором хранятся `ViewModelStore`.

В нашем случае `findViewTreeViewModelStoreOwner` находит `ViewModelStoreOwner` у родительского view: `FrameLayout(R.id.frameRootLayout)`, и
мы
получаем `ViewModelStoreOwner` и по умолчанию создаём `ViewModel` вызовом `ViewModelProvider`.
В конечном итоге таким образом наша ViewModel, которую создали внутри TranslatableTextView, будет храниться в
ViewModelStore, принадлежащей Activity.

Теперь вопрос, а почему мы это рассмотрели? И при чём тут Compose? Ответ в следующей главе статьи.

### Где Compose хранит `ViewModel`-и?

Давайте возьмём очень простую `ViewModel` и очень простой composable screen. Начнём с `ViewModel`:

```kotlin
class MyViewModel : ViewModel() {
    fun getName(): String = "Compose"
}
```

Наша `ViewModel` очень простая, и она нам нужна только в качестве примера, чтобы добраться до сути. Далее, наш
Composable Screen:

```kotlin
@Composable
fun Greeting(modifier: Modifier = Modifier) {
    val viewModel = androidx.lifecycle.viewmodel.compose.viewModel<MyViewModel>()
    Text(
        text = "Hello ${viewModel.getName()}",
        modifier = modifier
    )
}
```

Теперь продолжим:

---

`viewModel()` — это функция из библиотеки: **androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7**. Я специально указал
полный путь к функции в примере, чтобы вас не смущало, где она хранится и откуда взялась. С использованием Koin,
например, мы могли бы использовать `koinViewModel()` из библиотеки `io.insert-koin:koin-androidx-compose`, или даже
`hiltViewModel()` из `androidx.hilt:hilt-navigation-compose`.

Независимо от того, какой метод мы бы использовали для получения `ViewModel` в Compose, все они работают под капотом
одинаково, особенно в контексте получения `ViewModelStore`, так как его из воздуха не взять. Поэтому давайте начнём
изучение с `androidx.lifecycle.viewmodel.compose.viewModel()`, потому что он был первым, а библиотеки вроде Hilt и Koin
для создания `ViewModel` в Compose используют похожий механизм.

Далее, исходники метода `androidx.lifecycle.viewmodel.compose.viewModel` в файле:

**`androidx.lifecycle.viewmodel.compose.ViewModel.kt:`**

```kotlin
@Suppress("MissingJvmstatic")
@Composable
public inline fun <reified VM : ViewModel> viewModel(
    viewModelStoreOwner: ViewModelStoreOwner = checkNotNull(LocalViewModelStoreOwner.current) {
        "No ViewModelStoreOwner was provided via LocalViewModelStoreOwner"
    },
    ...
): VM = viewModel(VM::class, viewModelStoreOwner, key, factory, extras)
```

Остальные входные параметры нас не интересуют в этой статье, кроме параметра **`viewModelStoreOwner`**:

```kotlin
viewModelStoreOwner: ViewModelStoreOwner = checkNotNull(LocalViewModelStoreOwner.current) {
    "No ViewModelStoreOwner was provided via LocalViewModelStoreOwner"
},
```

Далее нас будет интересовать LocalViewModelStoreOwner.current - так как он нам предоставляет ViewModelStore, судя по
всему. LocalViewModelStoreOwner.current из названия и синтаксиса сразу понятно, что это CompositionLocal:

> `CompositionLocal` — это механизм в `Jetpack Compose`, позволяющий передавать значения по дереву UI без явной передачи через параметры,
> с доступом к ним через .current в любой точке композиции. Для использования необходимо предварительно предоставить значение через
> `CompositionLocalProvider` или задать его по умолчанию при создании.

Давайте глянем на исходники LocalViewModelStoreOwner:

```kotlin
/**
 * The CompositionLocal containing the current [ViewModelStoreOwner].
 */
public object LocalViewModelStoreOwner {
    private val LocalViewModelStoreOwner =
        compositionLocalOf<ViewModelStoreOwner?> { null }

    /**
     * Returns current composition local value for the owner or `null` if one has not
     * been provided nor is one available via [findViewTreeViewModelStoreOwner] on the
     * current [androidx.compose.ui.platform.LocalView].
     */
    public val current: ViewModelStoreOwner?
        @Composable
        get() = LocalViewModelStoreOwner.current ?: findViewTreeViewModelStoreOwner()

    /**
     * Associates a [LocalViewModelStoreOwner] key to a value in a call to
     * [CompositionLocalProvider].
     */
    public infix fun provides(viewModelStoreOwner: ViewModelStoreOwner):
            ProvidedValue<ViewModelStoreOwner?> {
        return LocalViewModelStoreOwner.provides(viewModelStoreOwner)
    }
}
```

Видим, что `LocalViewModelStoreOwner` — это просто обёртка над настоящим `CompositionLocal`. Мы обращаемся именно к его полю
current, чтобы прочесть текущее значение. Мы либо попытаемся достать значение из поля current у `CompositionLocal` — это
означает, что кто-то где-то должен был его `provide`-ить. Если же там пусто, то в таком случае вызывается метод
`findViewTreeViewModelStoreOwner`. При обычном сценарии использования из коробки мы попадаем именно под второй кейс,
когда вызывается метод `findViewTreeViewModelStoreOwner`. Поэтому далее рассмотрим его исходники:

**LocalViewModelStoreOwner.android.kt**

```kotlin
@Composable
internal actual fun findViewTreeViewModelStoreOwner(): ViewModelStoreOwner? =
    LocalView.current.findViewTreeViewModelStoreOwner()
```

И мы видим, что у другого `CompositionLocal` — `LocalView` вызывается метод View.findViewTreeViewModelStoreOwner() — это тот
самый метод, который мы уже смотрели в первой части статьи. LocalView.current возвращает нам текущий View. Текущий View?
Разве мы не работаем сейчас в compose? Откуда взялся текущий View? Об этом чуть позже узнаем, что это за View и откуда
он взялся. Сейчас просто знайте, что под капотом LocalView.current нам возвращает текущий View, у которого мы можем
вызвать extension-функцию `findViewTreeViewModelStoreOwner`, которую мы уже видели в первой части статьи, и положит
ViewModel в ViewModelStore:

**ViewTreeLifecycleOwner.android.kt**

```kotlin
/**
 * Retrieve the [ViewModelStoreOwner] associated with the given [View]. This may be used to retain
 * state associated with this view across configuration changes.
 *
 * @return The [ViewModelStoreOwner] associated with this view and/or some subset of its ancestors
 */
@JvmName("get")
public fun View.findViewTreeViewModelStoreOwner(): ViewModelStoreOwner? {
    var currentView: View? = this
    while (currentView != null) {
        val storeOwner =
            currentView.getTag(R.id.view_tree_view_model_store_owner) as? ViewModelStoreOwner
        if (storeOwner != null) {
            return storeOwner
        }
        currentView = currentView.getParentOrViewTreeDisjointParent() as? View
    }
    return null
}
```

Пройдёмся ещё раз по флоу:

Когда мы внутри нашего Composable-функций вызываем любую из extension-функций по созданию viewmodel: то ли viewModel из
библиотеки **androidx.lifecycle:lifecycle-viewmodel-composе**, или хоть даже `koinViewModel()` из библиотеки
`io.insert-koin:koin-androidx-compose`, или даже `hiltViewModel()` из `androidx.hilt:hilt-navigation-compose`, то в
конечном итоге мы обращаемся именно к CompositionLocal с названием `LocalViewModelStoreOwner` к его полю current. А тот,
в свою очередь, либо достаёт значение, которое внутри него хранится, либо обращается к Composable-методу
`findViewTreeViewModelStoreOwner`. А тот, в свою очередь, обращается к `LocalView` — это ещё один `CompositionLocal`, у
которого есть текущее `View`, и для него запускается extension-метод `View.findViewTreeViewModelStoreOwner`, и
происходит
поиск по дереву `View` в поисках `ViewModelStoreOwner`. В итоге он его находит, но как? В голове возникают два вопроса:

1. При чём тут View-шки? Почему Compose обращается к LocalView, и LocalView откуда сам взялся?
2. Из предыдущей главы в статье мы увидели, что прежде чем вызывать метод View.findViewTreeViewModelStoreOwner(), до
   него мы клали ViewModelStoreOwner во внутренний тег внутри FrameLayout, который являлся рутовым View в нашем макете,
   с помощью метода setViewTreeViewModelStoreOwner. Но в примере с Compose мы ничего никуда не клали — как всё это
   работает само по себе?

Всё довольно просто, разработчики Google позаботились об этом за нас. Обычно в Composable есть два подхода:

1. Когда весь проект на Compose полностью, или как минимум в каждой активити UI-дерево начинается с `setContent{}`,
   а не с `setContentView`:

   ```kotlin
   class MainActivity : ComponentActivity() {
   
       override fun onCreate(savedInstanceState: Bundle?) {
           super.onCreate(savedInstanceState)
           setContent {
               Greeting(modifier = Modifier.fillMaxWidth())
           }
       }
   }
   ```

2. Гибридный UI, где часть на compose, а часть на View. Тогда прибегают к использованию ComposeView:

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
              android:id="@+id/linearLayout"
              android:layout_width="match_parent"
              android:layout_height="match_parent"
              android:orientation="vertical">

    <androidx.compose.ui.platform.ComposeView
            android:id="@+id/composeView"
            android:layout_width="match_parent"
            android:layout_height="200dp"/>
</LinearLayout>
```

```kotlin
class MainActivity : ComponentActivity(R.layout.activity_main) {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val composeView = findViewById<ComposeView>(R.id.composeView)

        composeView.setContent { Greeting() }
    }
}
```

В обоих случаях, если запустить в таком виде, как сейчас, всё заработает: наша `ViewModel` внутри функции **`Greeting`**
без
проблем создастся и положится в `ViewModelStore`, который принадлежит Activity. Почему так происходит?

В обоих случаях мы вызываем метод setContent{}, в первом кейсе это `ComponentActivity.setContent{}`, а во втором
`ComposeView.setContent {}`, которые открывают Composable-область.

Рассмотрим сначала первый кейс, начнём с setContent для активити (ComponentActivity).

#### Использование ComponentActivity.setContent:

```kotlin
public fun ComponentActivity.setContent(
    parent: CompositionContext? = null,
    content: @Composable () -> Unit
) {
    val existingComposeView =
        window.decorView.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as? ComposeView

    if (existingComposeView != null)
        with(existingComposeView) {
            setParentCompositionContext(parent)
            setContent(content)
        }
    else
        ComposeView(this).apply {
            // Set content and parent **before** setContentView
            // to have ComposeView create the composition on attach
            setParentCompositionContext(parent)
            setContent(content)
            // Set the view tree owners before setting the content view so that the inflation
            // process and attach listeners will see them already present
            setOwners()
            setContentView(this, DefaultActivityContentLayoutParams)
        }
}
```

> Обратите внимание, что это функция расширения setContent является расширением для ComponentActivity и имеет
> дополнительную логику по инициализации Owner-ов и прочих компонентов. Внутри себя она использует ComposeView и его
> метод
> setContent.

Что здесь происходит? У window есть DecorView, внутри этого DecorView лежит ещё один ViewGroup(FrameLayout). У этого
ViewGroup извлекается ComposeView под индексом 0, если он есть. Если его нет, то создается новый и вызывается метод
setContentView (который есть у всех активити и унаследован от самого Activity). Но то, что нам нужно, происходит до
вызова метода setContentView — речь идёт о `setOwners`. Давайте глянем на его исходники тоже:

```kotlin
private fun ComponentActivity.setOwners() {
    val decorView = window.decorView
    ...
    if (decorView.findViewTreeViewModelStoreOwner() == null) {
        decorView.setViewTreeViewModelStoreOwner(this)
    }
    ...
}
```

И именно здесь ViewModelStoreOwner кладётся в DecorView посредством вызова метода setViewTreeViewModelStoreOwner,
куда передается this — то есть само активити. DecorView является самым(почти) корневым View во всей иерархии View,
выше его стоит только сам Window.

## Общая картина взаимодействия ViewModelStoreOwner, ComposeView и LocalView

Теперь давайте обобщим весь процесс и сделаем итоги: когда мы используем ComponentActivity (или его наследников
FragmentActivity и AppCompatActivity) в Compose и создаём ViewModel, используя делегаты compose/hilt/koin, то внутри
идёт обращение к LocalViewModelStoreOwner.
Тот отдаёт ViewModelStoreOwner, если он есть. Если нет, то обращается к Composable-методу
`findViewTreeViewModelStoreOwner`. Тот, в свою очередь, внутри себя обращается к composition local — LocalView.current,
получает View и у этого View вызывает другой extension-метод View.findViewTreeViewModelStoreOwner. Этот метод
рекурсивно, начиная с LocalView, ищет сохранённый ViewModelStoreOwner в тегах View и так добирается вверх по иерархии
View, пока не найдёт. Если найдёт, то вернёт его; если не найдёт, то вернёт null, и выбросится ошибка:
**_No ViewModelStoreOwner was provided via LocalViewModelStoreOwner_**

Как мы видели выше, при вызове `ComponentActivity.setContent{}` под капотом внутри вызывается метод
`ComponentActivity.setOwners()`, в котором помещается ViewModelStoreOwner в тег DecorView. Получается, что при вызове
метода View.findViewTreeViewModelStoreOwner(), пробираясь по иерархии View, в конечном итоге найдётся
ViewModelStoreOwner внутри самой верхней View (DecorView), но в Compose нет прямого доступа к DecorView, вместо этого
идёт обращение к LocalView.current:

**LocalViewModelStoreOwner.android.kt**

```kotlin
@Composable
internal actual fun findViewTreeViewModelStoreOwner(): ViewModelStoreOwner? =
    LocalView.current.findViewTreeViewModelStoreOwner()
```

В этой цепочке мы не рассмотрели только один момент — откуда берётся `LocalView`. Точнее, понятно, что это
`CompositionLocal`, но **откуда в нём ссылка на текущее `View`?** или **кем является текущее `View`?**

Если кратко и абстрактно: `ComposeView` внутри себя сам вызывает `LocalView` и провайдит ему **самого себя**. Поэтому
`LocalView` по умолчанию ссылается на тот `ComposeView`, в котором было запущено дерево Composable-функций. А дерево
Compose в Android всегда начинается именно с ComposеView.

Ниже — полный путь до момента, где `LocalView` получает значение. Без подробных комментариев, просто цепочка:

```kotlin
class ComposeView @JvmOverloads constructor(...) : AbstractComposeView(context, attrs, defStyleAttr)
```

`ComposeView` наследуется от `AbstractComposeView`. Смотрим, что происходит внутри `AbstractComposeView`:

```kotlin
abstract class AbstractComposeView(...) : ViewGroup(...) {
    private fun ensureCompositionCreated() {
        if (composition == null) {
            composition = setContent(resolveParentCompositionContext()) {
                Content()
            }
        }
    }
}
```

В методе `ensureCompositionCreated`, который вызывается, например, при `onMeasure` или `onAttachedToWindow`, или когда
вызываем ComposeView.setContent, нас интересует вызов функции `setContent`:

```kotlin
internal fun AbstractComposeView.setContent(...): Composition {
    val composeView = ... ?: AndroidComposeView(...).also {
        addView(it.view, DefaultLayoutParams)
    }
    return doSetContent(composeView, parent, content)
}
```

Тут происходит следующее: создаётся объект класса `AndroidComposeView`, этот же объект помещается внутрь `ComposeView`
вызовом `addView`. Напоминаю, что `AbstractComposeView` это абстрактный класс, и один из его наследников — это
`ComposeView`. Хоть здесь работа идёт на уровне абстракций, фактически когда вызывается `addView`, то он вызывается для
`ComposeView`.

Если стало слишком много новых названий, которые вызывают путаницу, то вот краткое объяснение:

- `AbstractComposeView` - абстрактный класс, который является ViewGroup и имеет уже много реализаций внутри
- `ComposeView` - один из наследников `AbstractComposeView`, который позволяет нам запускать Composable функции внутри
  себя. В Android всё упирается в работу с ним в конечном итоге, так как в Android нет способа запускать Composable
  напрямую на уровне Window. Между Window и нашими Composable экранами стоят куча View и ViewGroup, в том числе и сам
  `ComposeView`
- `AndroidComposeView` - низкоуровневый класс, внутри которого в конечном итоге и рисуются наши Composable экраны

Далее — `doSetContent`:

```kotlin
private fun doSetContent(
    owner: AndroidComposeView,
    parent: CompositionContext,
    content: @Composable () -> Unit
): Composition {
    ...
    val wrapped = owner.view.getTag(R.id.wrapped_composition_tag)
            as? WrappedComposition
        ?: WrappedComposition(owner, original).also {
            owner.view.setTag(R.id.wrapped_composition_tag, it)
        }
    wrapped.setContent(content)
}
```

Переходим в `WrappedComposition.setContent`:

```kotlin
private class WrappedComposition(
    val owner: AndroidComposeView,
    val original: Composition
) : Composition, LifecycleEventObserver, CompositionServices {
    override fun setContent(content: @Composable () -> Unit) {
        ...
        ProvideAndroidCompositionLocals(owner, content)
        ...
    }
}
```

И вот — ключевой момент:

```kotlin
@Composable
internal fun ProvideAndroidCompositionLocals(
    owner: AndroidComposeView,
    content: @Composable () -> Unit
) {
    CompositionLocalProvider(
        ...
    LocalView provides owner.view,
    ...
    ) {
        content()
    }
}
```

Здесь `LocalView` получает значение `owner.view`, где `owner` — это `AndroidComposeView`, созданный внутри
`ComposeView`.

---

**Вывод:** `LocalView` получает ссылку на `View`, внутри которого выполняется композиция, за счёт того, что
`ComposeView` сам инициализирует `AndroidComposeView`, который далее передаётся в `ProvideAndroidCompositionLocals`.
`AndroidComposeView` создаётся и хранится **внутри** `ComposeView`, и `LocalView` ссылается именно на этот
`AndroidComposeView`, а не на сам `ComposeView`.

`ComposeView` наследуется от `AbstractComposeView`, который в свою очередь — `ViewGroup`. То есть `ComposeView` — это не
сам `AndroidComposeView`, а просто контейнер, который при вызове `setContent` создаёт `AndroidComposeView` и вставляет
его внутрь.

Поэтому, когда в `ProvideAndroidCompositionLocals` происходит вот это:

```kotlin
LocalView provides owner.view
```

`owner.view` — это `AndroidComposeView`, а не `ComposeView`.

Иерархия `View`, если `Activity` — это `AppCompatActivity`, будет выглядеть так:

```
ViewRootImpl
└── DecorView -> имеет слабую ссылку на ViewModelStoreOwner (то есть активити)
    └── LinearLayout
        └── FrameLayout
            └── FitWindowsLinearLayout (action_bar_root)
                └── ContentFrameLayout (android:id/content)
                    └── ComposeView
                        └── AndroidComposeView -> имеет слабую ссылку на ViewModelStoreOwner (то есть активити)
```

А если это `ComponentActivity` или `FragmentActivity`, то чуть короче:

```
ViewRootImpl
└── DecorView -> имеет слабую ссылку на ViewModelStoreOwner (то есть активити)
    └── LinearLayout
        └── FrameLayout (android:id/content)
            └── ComposeView
                └── AndroidComposeView -> имеет слабую ссылку на ViewModelStoreOwner (то есть активити)
```
<note title="Интересный факт">

`ViewRootImpl` — это корневой элемент всей иерархии `View`. На практике каждый Android-разработчик хотя бы раз сталкивался с ошибкой:

> "Only the original thread that created a view hierarchy can touch its views."

Эта ошибка возникает, если попытаться обратиться к `View` из не-UI потока. А выбрасывает её как раз `ViewRootImpl` внутри метода `checkThread()`:

```java
public final class ViewRootImpl implements ViewParent, ... {

    void checkThread() {
        Thread current = Thread.currentThread();
        if (mThread != current) {
            throw new CalledFromWrongThreadException(
                "Only the original thread that created a view hierarchy can touch its views."
                + " Expected: " + mThread.getName()
                + " Calling: " + current.getName());
        }
    }
}
```
</note>

Ключевая мысль — `LocalView` по умолчанию указывает на `AndroidComposeView`, который создаётся внутри `ComposeView`
динамически. Сам `ComposeView` — просто оболочка, которая знает, как всё связать и встроить дерево `Composable` в нужное
место иерархии.

Тут мы рассмотрели первый кейс, когда мы используем ComponentActicity.setContent{} с передачей нашей композиции и
создания ViewModel. Второй флоу использования — это внутри иерархии View, например, если у нас все экраны на
Fragment/View, и мы в каких-то местах используем Compose. Это возможно благодаря ComposeView. Рассмотрим такой кейс:

#### Использование СomposeView.setContent:

Вот пример кода из примеров выше:

```kotlin
class MainActivity : ComponentActivity(R.layout.activity_main) {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val composeView = findViewById<ComposeView>(R.id.composeView)

        composeView.setContent { Greeting() }
    }
}
```

```kotlin
@Composable
fun Greeting(modifier: Modifier = Modifier) {
    val viewModel = androidx.lifecycle.viewmodel.compose.viewModel<MyViewModel>()
    Text(
        text = "Hello ${viewModel.getName()}",
        modifier = modifier
    )
}
```

Как работает setContent у ComposeView мы уже рассмотрели. Внутри себя ComposeView.setContent не кладёт ссылку на
ViewModelStoreOwner и не имеет внутри себя вызов функции setViewTreeViewModelStoreOwner, он только помогает провайдить
LocalView.

Но если запустить код в текущем виде, всё заработает как ожидалось. В чём дело? Ситуация аналогичная, как и ранее,
когда уже за нас предусмотрели такую логику. Дело в следующем: при вызове метода setContentView(R.layout.activity_main)
или даже при передаче ссылки на layout в конструктор: ComponentActivity(R.layout.activity_main) происходит следующая
цепочка:

Если передаем Layout Id в конструктор:

```kotlin
open class ComponentActivity() ... {

    @ContentView
    constructor(@LayoutRes contentLayoutId: Int) : this() {
    this.contentLayoutId = contentLayoutId
}

    override fun onCreate(savedInstanceState: Bundle?) {
        ...
        if (contentLayoutId != 0) {
            setContentView(contentLayoutId)
        }
    }
}
```

В методе `onCreate` вызывается setContentView, если передали contentLayoutId в конструктор. Если же напрямую вызвали
setContentView, то логика следующая:

Когда мы вызываем метод setContentView() и передаем нашу View или id макета, то под капотом происходит следующее (далее
исходники метода setContentView):

```kotlin
open class ComponentActivity() ... {

    override fun setContentView(@LayoutRes layoutResID: Int) {
        initializeViewTreeOwners()
        reportFullyDrawnExecutor.viewCreated(window.decorView)
        super.setContentView(layoutResID)
    }
}
```

Название метода initializeViewTreeOwners выглядит заманчивым, поэтому глянем в исходники:

```kotlin
@CallSuper
open class ComponentActivity() ... {

    open fun initializeViewTreeOwners() {
        ...
        window.decorView.setViewTreeViewModelStoreOwner(this)
        ...
    }
}
```

И мы здесь видим, что у window вызывается метод `getDecorView` (в Kotlin все геттеры из Java имеют синтаксис как у
переменной), и дальше вызывается функция setViewTreeViewModelStoreOwner, который помещает this (ViewModelStoreOwner) в
тег внутрь DecorView.

Сделаем итоги: когда мы начинаем свой UI с метода setContentView или передаем layout id в конструктор активити, то
внутри самого ComponentActivity (он же родитель для FragmentActivity и AppCompatActivity) срабатывает логика, которая
помещает себя (активити реализует интерфейс ViewModelStoreOwner) во внутренний тег DecorView (он же почти самый высокий
по иерархии) посредством вызова метода setViewTreeViewModelStoreOwner. Далее, когда мы добавляем в иерархию View свой
ComposeView, чтобы начать писать на Compose, то внутри ComposeView провайдится значение для LocalView.current. Затем при
создании ViewModel внутри Compose идет обращение к LocalViewModelStoreOwner, а именно к его полю current. Там
проверяется, есть ли значение, и если нет, вызывается метод `findViewTreeViewModelStoreOwner` у LocalView, который ищет
ViewModelStoreOwner, поднимаясь вверх по иерархии, пока не найдет. Таким образом, в конечном итоге находится
ViewModelStoreOwner у DecorView. Вот так всё и работает. Далее диаграмма иерархии View:

```
ViewRootImpl
└── DecorView -> имеет слабую ссылку на ViewModelStoreOwner (то есть активити)
    └── LinearLayout
        └── FrameLayout (android:id/content)
            └── FrameLayout (app:id/frameRootLayout)
                └── ComposeView (app:id/composeView)
                    └── AndroidComposeView
```

На этом статья почти закончена, осталось пролить свет на один момент. К этому моменту вся информация выше наводит на
мысль: а почему мы в начале статьи вручную сами вызывали метод `setViewTreeViewModelStoreOwner`, если всё это делается
за
нас?

(P.S. я возвращаюсь к примеру в начале статьи с View (TranslatableTextView))

Благодаря тому, что мы установили ViewModelStoreOwner для нашего корневого layout внутри нашего макета, тег внутри
FrameLayout (frameRootLayout) имеет ссылку (weak) на ViewModelStoreOwner:

```kotlin
class MainActivity : AppCompatActivity() {

    private val frameRootLayout by lazy { findViewById<FrameLayout>(R.id.frameRootLayout) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        ...
        // Привязываем ViewModelStoreOwner к дереву View
        frameRootLayout.setViewTreeViewModelStoreOwner(this)
        ...
    }
}
```

И метод `findViewTreeViewModelStoreOwner`, когда пробегается по иерархии View, сначала поищет в TranslatableTextView, а
затем, если он не найдет, будет подниматься вверх по родителям. Родитель — это frameRootLayout (FrameLayout), там он и
найдет ViewModelStoreOwner. Но что, если мы удалим установку `frameRootLayout.setViewTreeViewModelStoreOwner(this)` и
запустим код?

```kotlin
class TranslatableTextView(context: Context) : AppCompatTextView(context) {

    private val viewModel: TranslatableTextViewViewModel by lazy {
        val owner = findViewTreeViewModelStoreOwner() ?: error("ViewModelStoreOwner not found for TranslatableTextView")
        ViewModelProvider.create(owner = owner).get(TranslatableTextViewViewModel::class.java)
    }
    ...
}
```

То всё так же будет работать. Почему? Дело в том, что, как мы уже ранее рассмотрели в иерархии, есть ещё один родитель —
DecorView. Как это выглядит:

```
ViewRootImpl
└── DecorView -> имеет слабую ссылку на ViewModelStoreOwner (то есть активити)
    └── LinearLayout
        └── FrameLayout (android:id/content)
            └── FrameLayout (app:id/frameRootLayout)
                └── TranslatableTextView 
```

И когда мы вызываем метод AppCompatActivity.setContentView() и передаем нашу View или id макета, то под капотом
происходит следующее (далее исходники метода setContentView):

```kotlin
open class ComponentActivity() ... {

    override fun setContentView(@LayoutRes layoutResID: Int) {
        initializeViewTreeOwners()
        ...
    }
}
```

Название метода initializeViewTreeOwners выглядит заманчивым, поэтому глянем в исходники:

```kotlin
@CallSuper
open class ComponentActivity() ... {

    open fun initializeViewTreeOwners() {
        ...
        window.decorView.setViewTreeViewModelStoreOwner(this)
        ...
    }
}
```

Итог такой: вызывайте `setViewTreeViewModelStoreOwner` только если сами хотите указать, в какую `View` вы хотите
поместить определенный `ViewModelStoreOwner`. В Compose вызывайте `LocalViewModelStoreOwner provides yourViewModelStoreOwner`
только если у вас появилась в этом необходимость, но на практике не встречал, чтобы кто-то занимался этим, так как решения из  
коробки от Google всё решают, и в ручной работе обычно нет необходимости — unless вы реально что-то очень кастомное
мутите.

---

## ViewModel Compose DI Delegates:

Когда мы рассмотрели `ViewModel` для `Composable` функций, мы рассмотрели только `composable` функцию `viewModel()` —  
функцию из библиотеки: **androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7** без DI. И инициализация была такая:

```kotlin
@Composable
fun Greeting(modifier: Modifier = Modifier) {
    // тут специально не импортировал функцию
    val viewModel = androidx.lifecycle.viewmodel.compose.viewModel<MyViewModel>()
}
```

Ранее я говорил что:
> Когда мы внутри нашего `Composable`-функций вызываем любую из extension-функций по созданию `viewModel`: то ли
> 1. `viewModel` из библиотеки **androidx.lifecycle:lifecycle-viewmodel-composе**,
> 2. `koinViewModel()` из библиотеки `io.insert-koin:koin-androidx-compose`,
> 3. `hiltViewModel()` из `androidx.hilt:hilt-navigation-compose`,

То в конечном итоге мы обращаемся именно к `CompositionLocal` с названием `LocalViewModelStoreOwner` к его полю
`current`.  
Поэтому реализация везде одна и та же независимо от библиотеки, весь флоу который мы рассмотрели независимо от делегата
и библиотеки будет работать так же.

Давайте убедимся в этом, просто рассмотрим сигнатуру всех троих:

1. Первый мы уже видели, посмотрим еще раз:
   **`androidx.lifecycle.viewmodel.compose.ViewModel.kt`**
    ```kotlin
    @Suppress("MissingJvmstatic")
    @Composable
    public inline fun <reified VM : ViewModel> viewModel(
        viewModelStoreOwner: ViewModelStoreOwner = checkNotNull(LocalViewModelStoreOwner.current) {
            "No ViewModelStoreOwner was provided via LocalViewModelStoreOwner"
        },
        ...
    ): VM = viewModel(VM::class, viewModelStoreOwner, key, factory, extras)
    ```

2. Koin:
   **`org.koin.androidx.compose.ViewModel.kt:`**

```kotlin
@OptIn(KoinInternalApi::class)
@Composable
inline fun <reified T : ViewModel> koinViewModel(
    qualifier: Qualifier? = null,
    viewModelStoreOwner: ViewModelStoreOwner = checkNotNull(LocalViewModelStoreOwner.current) {
        "No ViewModelStoreOwner was provided via LocalViewModelStoreOwner"
    },
    ...
): T {
    return resolveViewModel(
        T::class, viewModelStoreOwner.viewModelStore, key, extras, qualifier, scope, parameters
    )
}
```

3.Hilt:
**`androidx.hilt.navigation.compose.HiltViewModel.kt:`**

```kotlin
@Composable
inline fun <reified VM : ViewModel> hiltViewModel(
    viewModelStoreOwner: ViewModelStoreOwner = checkNotNull(LocalViewModelStoreOwner.current) {
        "No ViewModelStoreOwner was provided via LocalViewModelStoreOwner"
    },
    key: String? = null
): VM {
    val factory = createHiltViewModelFactory(viewModelStoreOwner)
    return viewModel(viewModelStoreOwner, key, factory = factory)
}
```

Как можно заметить, все три делегата — `viewModel()`, `koinViewModel()` и `hiltViewModel()` — используют один и тот же
механизм получения `ViewModelStoreOwner` через `LocalViewModelStoreOwner.current`. Отличия лишь в синтаксисе и
дополнительной логике, связанной с DI, но в основе всё сводится к одному — получению `ViewModelStoreOwner` из дерева
`View`.

Причина проста: в Compose нет прямого доступа к `ComponentActivity` и её производным (`FragmentActivity`,
`AppCompatActivity`), как и к `Fragment` или `NavBackStackEntry`. 
Поэтому используется `LocalViewModelStoreOwner`, который при отсутствии значения в `current` обращается к `LocalView.current`и уже для
него вызывает метод`findViewTreeViewModelStoreOwner()` — стандартный способ получить ближайший `ViewModelStoreOwner` из иерархии `View`.

Именно поэтому `LocalViewModelStoreOwner` — ключевой элемент. Он — универсальный посредник между Compose и традиционным
ViewModel-механизмом Android. И независимо от того, используете ли вы Hilt, Koin или ничего из DI, — всё работает через
него.


